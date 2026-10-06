"""Extract text and physical locations; document contents are never instructions."""

import io
import json
import os
import signal
import subprocess
import sys
from hashlib import sha256
from pathlib import PurePosixPath
from tempfile import TemporaryDirectory
from uuid import uuid4
from zipfile import ZipFile

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException
from pypdf import PdfReader

from app.schemas import DocumentSegment, RequirementDocument
from app.services.document_tools import DocumentOptions, convert_legacy_doc, ocr_pdf_page

MAX_BYTES = 5_000_000
MAX_TEXT = 50_000
MAX_PAGES = 100
MAX_XML_BYTES = 20_000_000
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _has_images(page) -> bool:
    def inspect(resources, depth=0):
        if not resources or depth > 4:
            return False
        resources = resources.get_object() if hasattr(resources, "get_object") else resources
        objects = resources.get("/XObject", {})
        objects = objects.get_object() if hasattr(objects, "get_object") else objects
        for reference in list(objects.values())[:100]:
            item = reference.get_object()
            if item.get("/Subtype") == "/Image":
                return True
            if item.get("/Subtype") == "/Form" and inspect(item.get("/Resources"), depth + 1):
                return True
        return False

    return inspect(page.get("/Resources"))


def _extract(
    filename: str, content: bytes, options: DocumentOptions | None = None
) -> RequirementDocument:
    options = options or DocumentOptions()
    filename = PurePosixPath(filename.replace("\\", "/")).name
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension not in {"pdf", "docx", "doc"}:
        raise ValueError("Choose a PDF, .docx, or .doc file.")
    if not content or len(content) > MAX_BYTES:
        raise ValueError("Choose a non-empty file no larger than 5 MB.")
    parts: list[str] = []
    segments: list[DocumentSegment] = []
    warnings: list[str] = []
    length = 0

    def add(text: str, kind: str, number: int, method="text", confidence=None):
        nonlocal length
        text = text.strip()
        if not text:
            return
        start = length + (2 if parts else 0)
        length = start + len(text)
        if length > MAX_TEXT:
            raise ValueError(
                "Extracted text exceeds 50,000 characters. Split the document and reimport."
            )
        parts.append(text)
        segments.append(
            DocumentSegment(
                filename=filename,
                kind=kind,
                number=number,
                start=start,
                end=length,
                method=method,
                confidence=confidence,
            )
        )

    try:
        if extension == "pdf":
            if not content.startswith(b"%PDF-"):
                raise ValueError("This file is not a valid PDF.")
            reader = PdfReader(io.BytesIO(content))
            if reader.is_encrypted:
                raise ValueError("Encrypted PDFs are not supported. Upload a decrypted copy.")
            if len(reader.pages) > MAX_PAGES:
                raise ValueError("PDFs are limited to 100 pages. Split the document and reimport.")
            missing = []
            candidates = []
            for number, page in enumerate(reader.pages, 1):
                try:
                    text = page.extract_text() or ""
                except Exception:
                    text = ""
                    warnings.append(
                        f"Native text extraction failed on PDF page {number}; OCR was attempted."
                    )
                # OCR sparse native headings as well as the scanned body on a page.
                candidates.append(
                    (
                        number,
                        text,
                        not text.strip() or (len(text.strip()) < 100 and _has_images(page)),
                    )
                )
            if sum(candidate[2] for candidate in candidates) > options.ocr_max_pages:
                raise ValueError(
                    f"This PDF needs OCR on more than {options.ocr_max_pages} pages. "
                    "Split it into smaller files and reimport."
                )
            for number, text, needs_ocr in candidates:
                method, confidence = "text", None
                if needs_ocr:
                    try:
                        recognized, score, low_words = ocr_pdf_page(content, number - 1, options)
                        if recognized.strip():
                            text, method, confidence = recognized, "ocr", score
                            warnings.append(
                                f"PDF page {number} was read using Tesseract OCR "
                                f"({options.ocr_languages}). OCR text can contain errors; "
                                "check numbers, operators, and requirement wording "
                                "against the original. "
                                + (
                                    f"Mean word confidence score: {score}/100. "
                                    if score is not None
                                    else ""
                                )
                                + (f"{low_words} words scored below 60/100. " if low_words else "")
                                + "Confidence scores do not establish transcription accuracy."
                            )
                        else:
                            warnings.append(f"OCR found no readable text on PDF page {number}.")
                    except ValueError as error:
                        warnings.append(f"OCR failed on PDF page {number}: {error}")
                        # Native headings do not establish that a scanned body was read.
                        if text.strip():
                            warnings.append(
                                f"Only native text on PDF page {number} was retained; "
                                "its image content was not read."
                            )
                if not text.strip():
                    missing.append(number)
                add(text, "page", number, method, confidence)
            if missing:
                warnings.append(
                    "No readable text on PDF pages "
                    + ", ".join(map(str, missing))
                    + ". They may be blank or unreadable; these pages were not analyzed."
                )
            warnings.append(
                "PDF locations use physical page numbers starting at 1. "
                "Reading order, tables, diagrams, and embedded images on native-text pages "
                "may not be preserved. Check the extracted text against the original."
            )
        else:
            word_content = content
            if extension == "doc":
                word_content, engine = convert_legacy_doc(content, options)
                warnings.append(
                    f"Legacy Word .doc was converted with {engine}. "
                    "Paragraph locations refer to the converted body, not guaranteed original "
                    "Word paragraph positions. Conversion may change or omit "
                    "formatting and content."
                )
            with ZipFile(io.BytesIO(word_content)) as archive:
                entries = archive.infolist()
                if len(entries) > 2000 or sum(item.file_size for item in entries) > MAX_XML_BYTES:
                    raise ValueError("The Word document exceeds safe extraction limits.")
                if len({item.filename for item in entries}) != len(entries):
                    raise ValueError("The Word document contains duplicate ZIP entries.")
                root = ElementTree.fromstring(archive.read("word/document.xml"), forbid_dtd=True)
                body = root.find(W + "body")
                if body is None:
                    raise ValueError("The Word document has no document body.")
                # Includes table-cell paragraphs in document order. Empty paragraphs
                # still count, so paragraph numbers do not shift when text is absent.
                paragraphs = list(body.iter(W + "p"))
                nested = {id(p) for p in paragraphs for child in p for p in child.iter(W + "p")}
                for number, paragraph in enumerate(
                    (p for p in paragraphs if id(p) not in nested), 1
                ):

                    def text_nodes(node):
                        if node.tag in {W + "del", W + "drawing", W + "pict"}:
                            return ""
                        if node.tag == W + "t":
                            return node.text or ""
                        if node.tag == W + "tab":
                            return "\t"
                        if node.tag in {W + "br", W + "cr"}:
                            return "\n"
                        return "".join(text_nodes(child) for child in node)

                    add(
                        text_nodes(paragraph),
                        "paragraph",
                        number,
                        "converted" if extension == "doc" else "text",
                    )
                warnings.append(
                    "Word locations use body paragraph numbers, "
                    "including empty and table-cell paragraphs. "
                    "Page numbers are not available. Headers, footers, notes, "
                    "comments, deleted text, "
                    "images, formulas, embedded content, and text boxes are excluded. "
                    "Table layout is not preserved; "
                    "check the extracted text against the original."
                )
                if any(
                    name.startswith("word/header")
                    or name.startswith("word/footer")
                    or name in {"word/footnotes.xml", "word/endnotes.xml"}
                    for name in archive.namelist()
                ):
                    warnings.append(
                        "This document contains additional parts outside the body; "
                        "they were not extracted."
                    )
    except DefusedXmlException as error:
        raise ValueError("Unable to parse unsafe Word XML.") from error
    except ValueError:
        raise
    except Exception as error:
        raise ValueError(
            "Unable to parse this document. Upload a valid, unencrypted PDF, .docx, or .doc file."
        ) from error
    if not parts:
        details = " ".join(warnings[:3])
        raise ValueError(
            "No requirement text could be extracted. "
            + details
            + " Upload a clearer scan or a document containing readable text."
        )
    return RequirementDocument(
        id=str(uuid4()),
        filename=filename,
        format=extension,
        sha256=sha256(content).hexdigest(),
        text="\n\n".join(parts),
        segments=segments,
        warnings=warnings,
    )


def extract_document(filename: str, content: bytes, settings=None) -> RequirementDocument:
    """Isolate parsing and its child tools in a process group with a global deadline."""
    if len(content) > MAX_BYTES:
        raise ValueError("File exceeds the 5 MB upload limit.")
    from app.core.config import Settings

    settings = settings or Settings()
    options = DocumentOptions.from_settings(settings)
    with TemporaryDirectory(prefix="reqtest-import-") as folder:
        process = subprocess.Popen(
            [sys.executable, "-m", __name__, filename, options.model_dump_json()],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
            env={**os.environ, "TMPDIR": folder},
        )
        timed_out = False
        try:
            output, _ = process.communicate(
                content, timeout=settings.document_import_timeout_seconds
            )
        except subprocess.TimeoutExpired as error:
            timed_out = True
            _kill_group(process.pid)
            process.communicate()
            raise ValueError(
                "Document extraction timed out. Split or simplify the document."
            ) from error
        finally:
            if not timed_out:
                _kill_group(process.pid)
    if process.returncode:
        raise ValueError(
            "Document extraction exceeded safe limits or failed. Split or simplify the document."
        )
    response = json.loads(output)
    if "error" in response:
        raise ValueError(response["error"])
    return RequirementDocument.model_validate(response)


def _kill_group(pid: int):
    try:
        os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


if __name__ == "__main__":
    # macOS does not support the Linux address-space limit. File, XML, CPU,
    # rendering-pixel, and wall-time limits still apply on macOS.
    import resource

    if sys.platform.startswith("linux"):
        resource.setrlimit(resource.RLIMIT_AS, (1024 * 1024 * 1024, 1024 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (60, 60))
    resource.setrlimit(resource.RLIMIT_FSIZE, (25_000_000, 25_000_000))
    try:
        options = DocumentOptions.model_validate_json(sys.argv[2])
        print(
            _extract(sys.argv[1], sys.stdin.buffer.read(MAX_BYTES + 1), options).model_dump_json()
        )
    except Exception as error:
        print(json.dumps({"error": str(error)}))
