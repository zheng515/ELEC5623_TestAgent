"""Extract document text with explicit page outcomes and original provenance."""
import base64
from io import BytesIO, StringIO
import re
from zipfile import ZipFile, BadZipFile
from pathlib import Path
import subprocess
import tempfile
import time
import csv

OCR_PAGE_SECONDS = 24
LOW_CONFIDENCE = 70


def run(args, timeout):
    result = subprocess.run(args, capture_output=True, timeout=timeout, text=True)
    if result.returncode:
        raise ValueError("Document conversion or OCR failed.")
    return result.stdout


def ocr_page(data, page, timeout):
    deadline = time.monotonic() + timeout
    with tempfile.TemporaryDirectory(dir="/work") as directory:
        root = Path(directory)
        (root / "input.pdf").write_bytes(data)
        run(["pdftoppm", "-f", str(page), "-l", str(page), "-scale-to", "2000", "-singlefile", "-gray", "-png", str(root / "input.pdf"), str(root / "page")], min(12, timeout))
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise subprocess.TimeoutExpired("ocr", timeout)
        tsv = run(["tesseract", str(root / "page.png"), "stdout", "-l", "eng", "--psm", "3", "tsv"], min(12, remaining))
        lines, confidence = {}, []
        for row in csv.DictReader(StringIO(tsv), delimiter="\t"):
            text = (row.get("text") or "").strip()
            if text:
                key = (row["block_num"], row["par_num"], row["line_num"])
                lines.setdefault(key, []).append(text)
                if float(row["conf"]) >= 0:
                    confidence.append(float(row["conf"]))
        return "\n".join(" ".join(words) for words in lines.values()), round(sum(confidence) / len(confidence), 1) if confidence else 0


def convert_doc(data):
    if not data.startswith(bytes.fromhex("D0CF11E0A1B11AE1")):
        raise ValueError("This DOC is not a supported Word binary file. Open it in Word or LibreOffice, save as DOCX, then upload again.")
    with tempfile.TemporaryDirectory(dir="/work") as directory:
        root = Path(directory)
        (root / "input.doc").write_bytes(data)
        try:
            run(["libreoffice", "-env:UserInstallation=file://" + str(root / "profile"), "--headless", "--convert-to", "docx", "--outdir", str(root / "output"), str(root / "input.doc")], 45)
        except subprocess.TimeoutExpired as error:
            raise ValueError("Legacy Word conversion timed out. Save an unlocked DOCX copy in Word or LibreOffice and upload it instead.") from error
        except (ValueError, OSError) as error:
            raise ValueError("Legacy Word conversion failed. The file may be damaged or protected; save an unlocked DOCX copy and upload it instead.") from error
        target = root / "output/input.docx"
        if not target.exists():
            raise ValueError("Legacy Word conversion produced no readable document. Save an unlocked DOCX copy and upload it instead.")
        if target.stat().st_size > 10_000_000:
            raise ValueError("Converted Word document exceeds 10 MB. Upload a smaller section.")
        return target.read_bytes()


def extract_document(job):
    data = base64.b64decode(job["data"], validate=True)
    if len(data) > 10_000_000:
        raise ValueError("Requirement file exceeds 10 MB.")
    segments, warnings, pages = [], [], []

    def add(text, location, **source):
        text = text.strip()
        if text:
            segments.append({"id": "S" + str(len(segments) + 1), "text": text, "location": location, **source})

    def page_result(number, status, detail, **extra):
        pages.append({"page": number, "status": status, "detail": detail, **extra})
        if status in ("partial", "unreadable", "failed", "skipped"):
            warnings.append(f"Page {number}: {detail}")

    kind = job["format"]
    if kind == "pdf":
        from pypdf import PdfReader
        try:
            reader = PdfReader(BytesIO(data))
        except Exception as error:
            raise ValueError("Cannot read this PDF. It may be damaged; export an unlocked PDF and upload it again.") from error
        if reader.is_encrypted:
            raise ValueError("Encrypted PDFs are not supported. Upload an unlocked copy.")
        try:
            page_count = len(reader.pages)
        except Exception as error:
            raise ValueError("Cannot read the PDF pages. Export an unlocked PDF and upload it again.") from error
        for number in range(1, page_count + 1):
            text = ""
            try:
                page = reader.pages[number - 1]
                if page.get_contents() and len(page.get_contents().get_data()) > 5_000_000:
                    page_result(number, "skipped", "Page content exceeds supported complexity; export a simpler page.")
                    continue
                text = page.extract_text() or ""
                # Listing image IDs does not decode their pixel data.
                has_images = bool(page.images)
            except Exception:
                has_images = True
            if text.strip():
                for paragraph, block in enumerate(re.split(r"\n\s*\n", text), 1):
                    add(block, f"Page {number}, text block {paragraph}", page=number, paragraph=paragraph, extraction="text")
            if text.strip() and not has_images:
                page_result(number, "text", "Native text extracted.")
                continue
            try:
                ocr, confidence = ocr_page(data, number, OCR_PAGE_SECONDS)
            except (ValueError, OSError, subprocess.TimeoutExpired):
                page_result(number, "partial" if text.strip() else "failed", "OCR failed or timed out; image content remains unextracted. Upload a clearer page or paste its text.")
                continue
            if not ocr.strip():
                page_result(number, "partial" if text.strip() else "unreadable", "No readable image text after OCR; the page may be blank or unreadable.")
                continue
            if text.strip():
                # Keep native text and only supplement lines absent from it.
                native = {re.sub(r"\W+", "", line).casefold() for line in text.splitlines()}
                ocr = "\n".join(line for line in ocr.splitlines() if re.sub(r"\W+", "", line).casefold() not in native)
            add(ocr, f"Page {number} (English OCR)", page=number, extraction="ocr", confidence=confidence)
            low = confidence < LOW_CONFIDENCE
            detail = "Low OCR confidence; compare with the original page before using this text." if low else "English OCR attempted; transcription accuracy is not established."
            page_result(number, "partial" if low else "mixed" if text.strip() else "ocr", detail, confidence=confidence)
        warnings.append("English OCR confidence is a tool signal, not an accuracy score. PDF text order, images and tables may differ from the visual layout; check original pages.")
    elif kind in ("docx", "doc"):
        from docx import Document
        from docx.text.paragraph import Paragraph
        converted = convert_doc(data) if kind == "doc" else data
        if kind == "doc":
            warnings.append("Legacy DOC was converted with LibreOffice. Body-block locations refer to the converted document, not original page numbers; the original file is retained.")
        try:
            with ZipFile(BytesIO(converted)) as archive:
                if len(archive.infolist()) > 1000 or sum(item.file_size for item in archive.infolist()) > 30_000_000:
                    raise ValueError("Expanded Word document exceeds supported limits.")
        except BadZipFile as error:
            raise ValueError("Cannot read this Word document. It may be damaged or protected; upload an unlocked DOCX copy.") from error
        try:
            document = Document(BytesIO(converted))
        except Exception as error:
            raise ValueError("Cannot read this Word document. Export an unlocked DOCX copy from Word or LibreOffice and upload it again.") from error
        prefix = "Converted body block" if kind == "doc" else "Body block"
        for number, block in enumerate(document.iter_inner_content(), 1):
            if isinstance(block, Paragraph):
                add(block.text, f"{prefix} {number} (paragraph)", paragraph=number, extraction="text")
            else:
                for row_number, row in enumerate(block.rows, 1):
                    # Keep a requirement ID, its conditions and expected result together.
                    cells = {cell._tc: cell for cell in row.cells}.values()
                    text = "\n".join(paragraph.text for cell in cells for paragraph in cell.paragraphs if paragraph.text.strip())
                    add(text, f"{prefix} {number}, table row {row_number}", paragraph=number, extraction="text")
        warnings.append("Word locations use body block numbers, not rendered page numbers. Headers, footers, drawings, tracked changes and nested tables are not fully extracted.")
    elif kind in ("txt", "md"):
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise ValueError("Text documents must use UTF-8. Save the file as UTF-8 and upload it again.") from error
        for number, line in enumerate(text.splitlines(), 1):
            add(line, f"Line {number}", line=number, extraction="text")
    else:
        raise ValueError("Use PDF, DOC, DOCX, TXT or Markdown.")
    if not segments:
        detail = " ".join(warnings[:2])
        raise ValueError("No readable requirement text was found. Upload a clearer unlocked document or paste the text. " + detail)
    return {"segments": segments, "warnings": warnings, "pages": pages}
