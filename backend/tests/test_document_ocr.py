import base64
import io
import shutil
import subprocess
import sys
from pathlib import Path

import pytest
from conftest import register, wait_for_run
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject, NumberObject
from test_documents import docx, pdf

from app.core.config import Settings
from app.main import create_app
from app.schemas import RequirementItem
from app.services import document_parser, document_tools
from app.services.document_parser import _extract, extract_document
from app.services.document_tools import DocumentOptions, document_capabilities
from app.services.source_audit import audit_source


def scanned_pdf():
    image = Image.new("RGB", (1700, 2200), "white")
    draw = ImageDraw.Draw(image)
    draw.multiline_text(
        (120, 160),
        "R1: Orders of 100 or more ship free.\nR2: Negative amounts must raise ValueError.",
        font=ImageFont.load_default(size=38),
        fill="black",
        spacing=30,
    )
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    obj = DecodedStreamObject()
    obj.set_data(image.tobytes())
    obj.update(
        {
            NameObject("/Type"): NameObject("/XObject"),
            NameObject("/Subtype"): NameObject("/Image"),
            NameObject("/Width"): NumberObject(image.width),
            NameObject("/Height"): NumberObject(image.height),
            NameObject("/ColorSpace"): NameObject("/DeviceRGB"),
            NameObject("/BitsPerComponent"): NumberObject(8),
        }
    )
    page[NameObject("/Resources")] = DictionaryObject(
        {
            NameObject("/XObject"): DictionaryObject(
                {NameObject("/Scan"): writer._add_object(obj.flate_encode())}
            )
        }
    )
    stream = DecodedStreamObject()
    stream.set_data(b"q 612 0 0 792 0 0 cm /Scan Do Q")
    page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


@pytest.mark.skipif(not shutil.which("tesseract"), reason="Tesseract is not installed")
def test_real_ocr_reads_image_only_pdf_and_retains_page_quote_location():
    content = scanned_pdf()
    assert not PdfReader(io.BytesIO(content)).pages[0].extract_text().strip()
    document = extract_document("scan.pdf", content)
    assert "100" in document.text and "ship free" in document.text
    assert "ValueError" in document.text
    segment = document.segments[0]
    assert segment.method == "ocr" and segment.number == 1
    assert segment.confidence is not None
    assert any("Tesseract OCR" in warning for warning in document.warnings)
    requirement = RequirementItem(
        id="R1", text="Shipping threshold", source_quote="100", testable=True, ambiguity=None
    )
    audit = audit_source(
        document.text,
        [requirement],
        extraction_limit=40,
        returned_requirements=1,
        document=document,
    )
    assert audit.links[0].locations[0].method == "ocr"
    assert audit.links[0].locations[0].confidence == segment.confidence


@pytest.mark.skipif(not shutil.which("tesseract"), reason="Tesseract is not installed")
def test_real_mixed_pdf_uses_native_text_and_ocr_in_original_order():
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(pdf("Native rule."))))
    writer.append(PdfReader(io.BytesIO(scanned_pdf())))
    buffer = io.BytesIO()
    writer.write(buffer)
    document = extract_document("mixed.pdf", buffer.getvalue())
    assert [segment.method for segment in document.segments] == ["text", "ocr"]
    assert [segment.number for segment in document.segments] == [1, 2]
    assert document.text.startswith("Native rule.")


def test_ocr_failure_never_invents_text_or_silently_hides_missing_pages():
    missing = DocumentOptions(tesseract_binary="reqtest-no-such-tesseract")
    with pytest.raises(ValueError, match="Install Tesseract"):
        _extract("scan.pdf", scanned_pdf(), missing)
    with pytest.raises(ValueError, match="OCR is disabled"):
        _extract("scan.pdf", scanned_pdf(), DocumentOptions(ocr_enabled=False))
    document = _extract("mixed.pdf", pdf("Native rule.", ""), missing)
    assert document.text == "Native rule."
    assert any("OCR failed on PDF page 2" in warning for warning in document.warnings)
    assert any("not analyzed" in warning for warning in document.warnings)


def test_sparse_native_heading_with_scan_triggers_ocr(monkeypatch):
    writer = PdfWriter()
    writer.append(PdfReader(io.BytesIO(scanned_pdf())))
    page = writer.pages[0]
    native = PdfReader(io.BytesIO(pdf("Heading only."))).pages[0]
    resources = page["/Resources"]
    resources[NameObject("/Font")] = native["/Resources"]["/Font"].clone(writer)
    stream = DecodedStreamObject()
    stream.set_data(native["/Contents"].get_data() + b"\nq 612 0 0 792 0 0 cm /Scan Do Q")
    page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = io.BytesIO()
    writer.write(buffer)
    calls = []

    def recognize(content, page_index, options):
        calls.append(page_index)
        return "Heading only. Scanned requirement.", 58.0, 2

    monkeypatch.setattr(document_parser, "ocr_pdf_page", recognize)
    document = _extract("heading.pdf", buffer.getvalue())
    assert calls == [0]
    assert "Scanned requirement" in document.text
    assert document.segments[0].method == "ocr"
    assert any("below 60" in warning for warning in document.warnings)


def test_ocr_page_limit_rejects_without_silent_truncation():
    with pytest.raises(ValueError, match="more than 1 pages"):
        _extract("scan.pdf", pdf("", ""), DocumentOptions(ocr_max_pages=1))


def test_ocr_timeout_and_missing_language_are_explicit(monkeypatch):
    monkeypatch.setattr(document_tools.shutil, "which", lambda path: "/fake/tesseract")

    def timeout(*args, **kwargs):
        raise subprocess.TimeoutExpired("tesseract", 20)

    monkeypatch.setattr(document_tools.subprocess, "run", timeout)
    with pytest.raises(ValueError, match="timed out"):
        _extract("scan.pdf", scanned_pdf())
    assert not document_capabilities(DocumentOptions())["ocr_ready"]


@pytest.mark.skipif(sys.platform != "darwin", reason="Real macOS Word conversion requires textutil")
def test_real_doc_conversion_preserves_original_hash_and_marks_converted_paragraphs(tmp_path):
    source = tmp_path / "source.rtf"
    source.write_text(
        r"{\rtf1\ansi R1: Invalid amounts must raise ValueError.\par R2: Orders ship free.}"
    )
    target = tmp_path / "source.doc"
    subprocess.run(
        ["/usr/bin/textutil", "-convert", "doc", "-output", str(target), str(source)], check=True
    )
    content = target.read_bytes()
    assert content.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1")
    document = extract_document("original.doc", content)
    assert document.format == "doc" and document.filename == "original.doc"
    assert "ValueError" in document.text and "Orders ship free" in document.text
    assert all(segment.method == "converted" for segment in document.segments)
    assert any("not guaranteed original" in warning for warning in document.warnings)
    from hashlib import sha256

    assert document.sha256 == sha256(content).hexdigest()


def test_doc_conversion_missing_and_failed_dependency_are_clear(monkeypatch):
    content = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"invalid"
    monkeypatch.setattr(document_tools, "converter_path", lambda options: None)
    with pytest.raises(ValueError, match="Install LibreOffice"):
        _extract("legacy.doc", content)
    monkeypatch.setattr(document_tools, "converter_path", lambda options: "/fake/soffice")

    def fail(*args, **kwargs):
        raise ValueError("Document tool failed.")

    monkeypatch.setattr(document_tools, "_run_tool", fail)
    with pytest.raises(ValueError, match="tool failed"):
        _extract("legacy.doc", content)


def test_conversion_mock_keeps_offset_order_and_uses_original_filename(monkeypatch):
    monkeypatch.setattr(
        document_parser,
        "convert_legacy_doc",
        lambda content, options: (
            docx(
                "<w:p><w:r><w:t>First rule.</w:t></w:r></w:p>"
                "<w:p><w:r><w:t>Second rule.</w:t></w:r></w:p>"
            ),
            "LibreOffice",
        ),
    )
    document = _extract("legacy.doc", b"document")
    assert document.text == "First rule.\n\nSecond rule."
    assert [segment.number for segment in document.segments] == [1, 2]
    assert document.text[document.segments[1].start : document.segments[1].end] == "Second rule."
    assert all(segment.filename == "legacy.doc" for segment in document.segments)


@pytest.mark.skipif(not shutil.which("tesseract"), reason="Tesseract is not installed")
def test_api_imports_scanned_pdf_with_ocr_metadata_and_capabilities(tmp_path):
    settings = Settings(database_path=tmp_path / "docs.db", llm_enabled=False, _env_file=None)
    with TestClient(create_app(settings)) as client:
        assert client.get("/api/v1/documents/capabilities").status_code == 401
        register(client)
        capabilities = client.get("/api/v1/documents/capabilities").json()
        assert capabilities["ocr_ready"] and capabilities["ocr_languages"] == "eng"
        response = client.post(
            "/api/v1/documents/import",
            json={
                "filename": "scan.pdf",
                "content_base64": base64.b64encode(scanned_pdf()).decode(),
            },
        )
        assert response.status_code == 200, response.text
        document = response.json()
        assert document["segments"][0]["method"] == "ocr"
        project = client.post(
            "/api/v1/projects",
            json={
                "name": "OCR task",
                "requirements_text": document["text"],
                "requirement_document_id": document["id"],
            },
        ).json()
        assert project["requirement_document"] == document
        queued = client.post(f"/api/v1/projects/{project['id']}/runs").json()
        run = wait_for_run(client, queued["id"])
        assert run["report"]["requirement_document"]["segments"][0]["method"] == "ocr"
        html = client.get(f"/api/v1/runs/{run['id']}/report.html").text
        assert "page 1 · OCR (score" in html
        assert "Confidence scores do not establish transcription accuracy" in html


def test_libreoffice_conversion_uses_isolated_profile_and_cleans_temporary_files(monkeypatch):
    from urllib.parse import unquote, urlparse

    output = docx("<w:p><w:r><w:t>A rule.</w:t></w:r></w:p>")
    calls = []
    monkeypatch.setattr(document_tools, "converter_path", lambda options: "/fake/soffice")

    def convert(args, timeout):
        calls.append(args)
        assert timeout == 30
        assert "--headless" in args and "--norestore" in args
        assert "docx:Office Open XML Text" in args
        root = Path(args[args.index("--outdir") + 1])
        profile_arg = next(arg for arg in args if arg.startswith("-env:UserInstallation="))
        profile = Path(unquote(urlparse(profile_arg.split("=", 1)[1]).path))
        assert "<value>3</value>" in (profile / "user/registrymodifications.xcu").read_text()
        assert (root / "source.doc").read_bytes().startswith(b"\xd0\xcf\x11\xe0")
        (root / "source.docx").write_bytes(output)

    monkeypatch.setattr(document_tools, "_run_tool", convert)
    converted, engine = document_tools.convert_legacy_doc(
        b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", DocumentOptions()
    )
    assert converted == output and engine == "LibreOffice"
    assert not Path(calls[0][-1]).exists()


def test_missing_ocr_language_data_is_explicit(monkeypatch):
    monkeypatch.setattr(document_tools.shutil, "which", lambda name: "/fake/tesseract")
    monkeypatch.setattr(document_tools, "_available_languages", lambda binary: ["eng"])
    options = DocumentOptions(ocr_languages="eng+chi_sim")
    assert not document_capabilities(options)["ocr_ready"]
    with pytest.raises(ValueError, match="language data is missing"):
        _extract("scan.pdf", scanned_pdf(), options)


def test_analyzer_receives_ocr_limitations_as_data():
    from datetime import UTC, datetime

    from app.schemas import Project, RequirementAnalysis
    from app.services.analyzer import analyze_requirements

    document = _extract("native.pdf", pdf("A rule."))
    document.segments[0].method = "ocr"
    document.segments[0].confidence = 52
    document.warnings = ["OCR may have changed numbers."]

    class Model:
        def parse(self, **kwargs):
            assert "OCR may have changed numbers" in kwargs["prompt"]
            assert '"method": "ocr"' in kwargs["prompt"]
            assert "Do not reconstruct missing" in kwargs["prompt"]
            return RequirementAnalysis(requirements=[], notes="No model needed.")

    project = Project(
        name="Task",
        id="p1",
        created_at=datetime.now(UTC),
        requirements_text=document.text,
        requirement_document=document,
    )
    result = analyze_requirements(Model(), project, max_requirements=40)
    assert "OCR may have changed numbers." in result.source_audit.issues
