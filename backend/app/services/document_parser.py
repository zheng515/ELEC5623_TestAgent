"""Extract text and physical locations; document contents are never instructions."""

import io
import json
import subprocess
import sys
from hashlib import sha256
from pathlib import PurePosixPath
from uuid import uuid4
from zipfile import ZipFile

from defusedxml import ElementTree
from defusedxml.common import DefusedXmlException
from pypdf import PdfReader

from app.schemas import DocumentSegment, RequirementDocument

MAX_BYTES = 5_000_000
MAX_TEXT = 50_000
MAX_PAGES = 100
MAX_XML_BYTES = 20_000_000
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _extract(filename: str, content: bytes) -> RequirementDocument:
    filename = PurePosixPath(filename.replace("\\", "/")).name
    extension = filename.rsplit(".", 1)[-1].lower()
    if extension not in {"pdf", "docx"}:
        raise ValueError("Choose a PDF or .docx file. Convert legacy .doc files to .docx first.")
    if not content or len(content) > MAX_BYTES:
        raise ValueError("Choose a non-empty file no larger than 5 MB.")
    parts: list[str] = []
    segments: list[DocumentSegment] = []
    warnings: list[str] = []
    length = 0

    def add(text: str, kind: str, number: int):
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
            DocumentSegment(filename=filename, kind=kind, number=number, start=start, end=length)
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
            for number, page in enumerate(reader.pages, 1):
                text = page.extract_text() or ""
                if not text.strip():
                    missing.append(number)
                add(text, "page", number)
            if missing:
                warnings.append(
                    "No extractable text on PDF pages "
                    + ", ".join(map(str, missing))
                    + ". They may be blank or scanned. OCR is not supported; "
                    "these pages were not analyzed."
                )
            warnings.append(
                "PDF locations use physical page numbers starting at 1. "
                "Reading order, tables, diagrams, and embedded images may not be preserved. "
                "Check the extracted text against the original. OCR is not supported."
            )
        else:
            with ZipFile(io.BytesIO(content)) as archive:
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

                    add(text_nodes(paragraph), "paragraph", number)
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
            "Unable to parse this document. Upload a valid, unencrypted PDF or .docx file."
        ) from error
    if not parts:
        raise ValueError(
            "No requirement text could be extracted. Scanned/image-only documents need OCR, "
            "which is not supported. Upload a text-based PDF or a .docx file containing text."
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


def extract_document(filename: str, content: bytes) -> RequirementDocument:
    """Isolate parsing with CPU/time limits and Linux address-space limits."""
    if len(content) > MAX_BYTES:
        raise ValueError("File exceeds the 5 MB upload limit.")
    try:
        result = subprocess.run(
            [sys.executable, "-m", __name__, filename],
            input=content,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=20,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError(
            "Document extraction timed out. Split or simplify the document."
        ) from error
    if result.returncode:
        raise ValueError(
            "Document extraction exceeded safe limits or failed. Split or simplify the document."
        )
    response = json.loads(result.stdout)
    if "error" in response:
        raise ValueError(response["error"])
    return RequirementDocument.model_validate(response)


if __name__ == "__main__":
    # macOS does not support the Linux address-space limit. File, XML, CPU,
    # and wall-time limits still apply on macOS.
    import resource

    if sys.platform.startswith("linux"):
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    resource.setrlimit(resource.RLIMIT_CPU, (10, 10))
    try:
        print(_extract(sys.argv[1], sys.stdin.buffer.read(MAX_BYTES + 1)).model_dump_json())
    except Exception as error:
        print(json.dumps({"error": str(error)}))
