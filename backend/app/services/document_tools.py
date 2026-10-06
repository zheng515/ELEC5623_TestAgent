"""Local OCR and legacy Word conversion with bounded temporary files."""

import csv
import io
import math
import os
import shutil
import subprocess
import sys
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from pydantic import BaseModel, Field

MAX_RENDER_PIXELS = 12_000_000
MAX_TOOL_OUTPUT = 5_000_000


class DocumentOptions(BaseModel):
    ocr_enabled: bool = True
    ocr_languages: str = Field(default="eng", pattern=r"^[A-Za-z0-9_]+(?:\+[A-Za-z0-9_]+)*$")
    tesseract_binary: str = "tesseract"
    converter_binary: str = "soffice"
    ocr_max_pages: int = Field(default=20, ge=1, le=100)

    @classmethod
    def from_settings(cls, settings):
        return cls(
            ocr_enabled=settings.document_ocr_enabled,
            ocr_languages=settings.document_ocr_languages,
            tesseract_binary=settings.document_tesseract_binary,
            converter_binary=settings.document_converter_binary,
            ocr_max_pages=settings.document_ocr_max_pages,
        )


def converter_path(options: DocumentOptions) -> str | None:
    if sys.platform == "darwin" and Path("/usr/bin/textutil").is_file():
        return "/usr/bin/textutil"
    return shutil.which(options.converter_binary)


def _available_languages(binary: str) -> list[str]:
    try:
        result = subprocess.run(
            [binary, "--list-langs"],
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError("Checking OCR language data timed out.") from error
    except OSError as error:
        raise ValueError("Tesseract could not start. Check the server OCR dependencies.") from error
    return result.stdout.splitlines()[1:] if result.returncode == 0 else []


def document_capabilities(options: DocumentOptions) -> dict:
    binary = shutil.which(options.tesseract_binary) if options.ocr_enabled else None
    languages: list[str] = []
    if binary:
        try:
            languages = _available_languages(binary)
        except ValueError:
            pass
    return {
        "ocr_ready": bool(binary) and set(options.ocr_languages.split("+")) <= set(languages),
        "ocr_languages": options.ocr_languages,
        "doc_ready": bool(converter_path(options)),
    }


def _run_tool(args: list[str], timeout: int, env: dict | None = None):
    try:
        result = subprocess.run(
            args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=timeout,
            check=False,
            env=env,
        )
    except subprocess.TimeoutExpired as error:
        raise ValueError("Document tool timed out. Split or simplify the document.") from error
    except OSError as error:
        raise ValueError(
            "Document tool could not start. Check the server document dependencies."
        ) from error
    if result.returncode:
        raise ValueError("Document tool failed. The file may be damaged or password-protected.")


def _read_output(path: Path) -> bytes:
    if not path.is_file() or path.stat().st_size > MAX_TOOL_OUTPUT:
        raise ValueError("Document tool returned no output or exceeded safe output limits.")
    return path.read_bytes()


def convert_legacy_doc(content: bytes, options: DocumentOptions) -> tuple[bytes, str]:
    # Do not treat HTML/RTF/plain text renamed to .doc as a binary Word document.
    if not content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"):
        raise ValueError(
            "This is not a binary Word .doc file. Upload the file in its actual format."
        )
    binary = converter_path(options)
    if not binary:
        raise ValueError("Word .doc conversion is unavailable. Install LibreOffice on the server.")
    with TemporaryDirectory(prefix="reqtest-word-") as folder:
        root = Path(folder)
        source = root / "source.doc"
        source.write_bytes(content)
        target = root / "source.docx"
        if Path(binary).name == "textutil":
            engine = "macOS textutil"
            args = [
                binary,
                "-convert",
                "docx",
                "-format",
                "doc",
                "-strip",
                "-noload",
                "-output",
                str(target),
                str(source),
            ]
        else:
            engine = "LibreOffice"
            profile = root / "profile"
            (profile / "user").mkdir(parents=True)
            # A fresh profile avoids shared office locks and disables document macros.
            (profile / "user" / "registrymodifications.xcu").write_text(
                '<oor:items xmlns:oor="http://openoffice.org/2001/registry">'
                '<item oor:path="/org.openoffice.Office.Common/Security/Scripting">'
                '<prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop>'
                "</item></oor:items>",
                encoding="utf-8",
            )
            args = [
                binary,
                f"-env:UserInstallation={profile.as_uri()}",
                "--headless",
                "--norestore",
                "--convert-to",
                "docx:Office Open XML Text",
                "--outdir",
                str(root),
                str(source),
            ]
        _run_tool(args, timeout=30)
        return _read_output(target), engine


def ocr_pdf_page(content: bytes, page_index: int, options: DocumentOptions):
    if not options.ocr_enabled:
        raise ValueError("OCR is disabled on the server.")
    binary = shutil.which(options.tesseract_binary)
    if not binary:
        raise ValueError("OCR is unavailable. Install Tesseract and its configured language data.")
    if not set(options.ocr_languages.split("+")) <= set(_available_languages(binary)):
        raise ValueError(
            f"OCR language data is missing ({options.ocr_languages}). "
            "Install the configured Tesseract language packs."
        )
    import pypdfium2 as pdfium

    with TemporaryDirectory(prefix="reqtest-ocr-") as folder:
        root = Path(folder)
        image_path = root / "page.png"
        try:
            with pdfium.PdfDocument(content) as document:
                with closing(document[page_index]) as page:
                    width, height = page.get_size()
                    if not math.isfinite(width * height) or width <= 0 or height <= 0:
                        raise ValueError("Invalid PDF page dimensions.")
                    scale = min(300 / 72, math.sqrt(MAX_RENDER_PIXELS / (width * height)) * 0.99)
                    bitmap = page.render(scale=scale)
                    try:
                        image = bitmap.to_pil()
                        try:
                            image.save(image_path)
                        finally:
                            image.close()
                    finally:
                        bitmap.close()
        except Exception as error:
            raise ValueError("Unable to render this PDF page for OCR.") from error
        output = root / "recognized"
        env = {**os.environ, "OMP_THREAD_LIMIT": "1"}
        _run_tool(
            [
                binary,
                str(image_path),
                str(output),
                "-l",
                options.ocr_languages,
                "--psm",
                "3",
                "tsv",
            ],
            timeout=20,
            env=env,
        )
        tsv = _read_output(output.with_suffix(".tsv")).decode("utf-8")
        lines: dict[tuple, list[str]] = {}
        scores = []
        low_confidence_words = 0
        for row in csv.DictReader(io.StringIO(tsv), delimiter="\t", quoting=csv.QUOTE_NONE):
            if row.get("level") != "5" or not row.get("text", "").strip():
                continue
            key = tuple(row.get(field) for field in ("block_num", "par_num", "line_num"))
            lines.setdefault(key, []).append(row["text"].strip())
            try:
                score = float(row["conf"])
            except (KeyError, ValueError):
                score = -1
            if 0 <= score <= 100:
                scores.append(score)
                low_confidence_words += score < 60
        text = "\n".join(" ".join(words) for words in lines.values())
        return text, round(sum(scores) / len(scores), 1) if scores else None, low_confidence_words
