import base64
import io
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from conftest import register, wait_for_run
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from app.core.config import Settings
from app.main import create_app
from app.schemas import RequirementItem
from app.services.document_parser import _extract, extract_document
from app.services.source_audit import audit_source


def pdf(*texts):
    writer = PdfWriter()
    for text in texts:
        page = writer.add_blank_page(width=595, height=842)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})}
        )
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 12 Tf 50 700 Td ({text}) Tj ET".encode())
        page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def docx(body, extra=None):
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            "word/document.xml",
            (
                '<w:document xmlns:w="http://schemas.openxmlformats.org/'
                'wordprocessingml/2006/main"><w:body>' + body + "</w:body></w:document>"
            ),
        )
        for name, value in (extra or {}).items():
            archive.writestr(name, value)
    return buffer.getvalue()


def test_pdf_pages_and_quote_provenance():
    document = extract_document("spec.pdf", pdf("Orders must ship.", "Refunds must return zero."))
    assert document.text == "Orders must ship.\n\nRefunds must return zero."
    assert [segment.number for segment in document.segments] == [1, 2]
    requirement = RequirementItem(
        id="R1",
        text="Refunds return zero",
        source_quote="Refunds must return zero.",
        testable=True,
        ambiguity=None,
    )
    audit = audit_source(
        document.text,
        [requirement],
        extraction_limit=40,
        returned_requirements=1,
        document=document,
    )
    assert audit.links[0].locations[0].kind == "page"
    assert audit.links[0].locations[0].number == 2
    assert audit.unlinked_fragments[0].locations[0].number == 1
    assert audit.document.sha256 == document.sha256


def test_quote_crossing_pages_and_repeated_quotes():
    document = _extract("spec.pdf", pdf("Same rule.", "Same rule."))
    requirement = RequirementItem(
        id="R1", text="rule", source_quote="Same rule.", testable=True, ambiguity=None
    )
    audit = audit_source(
        document.text,
        [requirement],
        extraction_limit=40,
        returned_requirements=1,
        document=document,
    )
    assert audit.links == []
    assert audit.ambiguous_requirement_ids == ["R1"]
    requirement.source_quote = document.text
    audit = audit_source(
        document.text,
        [requirement],
        extraction_limit=40,
        returned_requirements=1,
        document=document,
    )
    assert [location.number for location in audit.links[0].locations] == [1, 2]


def test_word_empty_paragraphs_tables_and_excluded_text():
    content = docx(
        "<w:p/><w:p><w:r><w:t>Rule one.</w:t></w:r></w:p>"
        "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Table rule.</w:t></w:r></w:p>"
        "</w:tc></w:tr></w:tbl>"
        "<w:p><w:del><w:r><w:t>Removed</w:t></w:r></w:del>"
        "<w:r><w:t>Final rule.</w:t></w:r></w:p>",
        {"word/header1.xml": "not extracted"},
    )
    document = extract_document("../rules.docx", content)
    assert document.filename == "rules.docx"
    assert document.text == "Rule one.\n\nTable rule.\n\nFinal rule."
    assert [segment.number for segment in document.segments] == [2, 3, 4]
    assert all(segment.kind == "paragraph" for segment in document.segments)
    assert any("additional parts" in warning for warning in document.warnings)
    for segment in document.segments:
        assert document.text[segment.start : segment.end].endswith(".")


def test_missing_pdf_text_warns_without_inventing_requirements():
    with pytest.raises(ValueError, match="OCR"):
        extract_document("scan.pdf", pdf(""))
    document = _extract("mixed.pdf", pdf("A rule.", ""))
    assert document.text == "A rule."
    assert any("pages 2" in warning and "not analyzed" in warning for warning in document.warnings)


@pytest.mark.parametrize(
    "name,content,message",
    [
        ("old.doc", b"document", "binary Word"),
        ("fake.pdf", b"not pdf", "valid PDF"),
        ("broken.docx", b"not zip", "Unable to parse"),
        ("empty.docx", docx("<w:p/>"), "No requirement text"),
        ("huge.pdf", b"x" * 5_000_001, "5 MB"),
        ("long.docx", docx("<w:p><w:r><w:t>" + "a" * 50_001 + "</w:t></w:r></w:p>"), "50,000"),
    ],
    ids=["legacy", "fake-pdf", "broken-word", "empty-word", "oversize", "text-limit"],
)
def test_invalid_or_excessive_input_is_not_silently_truncated(name, content, message):
    with pytest.raises(ValueError, match=message):
        extract_document(name, content)


def test_unsafe_xml_and_zip_are_rejected():
    buffer = io.BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", '<!DOCTYPE x [<!ENTITY a "boom">]><x>&a;</x>')
    with pytest.raises(ValueError, match="Unable to parse"):
        _extract("unsafe.docx", buffer.getvalue())
    with pytest.raises(ValueError, match="safe extraction limits"):
        _extract("bomb.docx", docx("<w:p/>", {"large": b"a" * 20_000_001}))


def test_import_project_persistence_access_control_and_export(tmp_path):
    settings = Settings(database_path=tmp_path / "docs.db", llm_enabled=False, _env_file=None)
    app = create_app(settings)
    with TestClient(app) as client:
        payload = {
            "filename": "spec.pdf",
            "content_base64": base64.b64encode(pdf("A rule.")).decode(),
        }
        assert client.post("/api/v1/documents/import", json=payload).status_code == 401
        register(client)
        response = client.post("/api/v1/documents/import", json=payload)
        assert response.status_code == 200, response.text
        document = response.json()
        project_payload = {
            "name": "Imported task",
            "requirements_text": document["text"],
            "requirement_document_id": document["id"],
        }
        assert (
            client.post(
                "/api/v1/projects", json={**project_payload, "requirements_text": "Altered rule."}
            ).status_code
            == 422
        )
        response = client.post("/api/v1/projects", json=project_payload)
        assert response.status_code == 201, response.text
        project = response.json()
        assert (
            client.get(f"/api/v1/projects/{project['id']}").json()["requirement_document"]
            == document
        )
        run = client.post(f"/api/v1/projects/{project['id']}/runs").json()
        run = wait_for_run(client, run["id"])
        assert run["report"]["requirement_document"] == document
        html = client.get(f"/api/v1/runs/{run['id']}/report.html").text
        assert "spec.pdf" in html and "page 1" in html
        client.post("/api/v1/auth/logout")
        register(client, email="other@example.com")
        assert client.post("/api/v1/projects", json=project_payload).status_code == 404
    with TestClient(create_app(settings)) as client:
        client.headers["Content-Type"] = "application/json"
        from conftest import ACCOUNT

        assert (
            client.post(
                "/api/v1/auth/login", json={key: ACCOUNT[key] for key in ("email", "password")}
            ).status_code
            == 200
        )
        assert (
            client.get(f"/api/v1/projects/{project['id']}").json()["requirement_document"]
            == document
        )


def test_invalid_import_does_not_echo_contents(tmp_path):
    settings = Settings(database_path=tmp_path / "docs.db", llm_enabled=False, _env_file=None)
    with TestClient(create_app(settings)) as client:
        register(client)
        response = client.post(
            "/api/v1/documents/import",
            json={
                "filename": "spec.pdf",
                "content_base64": "secret payload!",
                "extra": "secret payload!",
            },
        )
        assert response.status_code == 422
        assert "secret payload!" not in response.text
        response = client.post(
            "/api/v1/documents/import", json={"filename": "spec.pdf", "content_base64": "invalid!"}
        )
        assert response.status_code == 422


def test_encrypted_and_overlong_pdf_are_rejected():
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    writer.encrypt("secret")
    buffer = io.BytesIO()
    writer.write(buffer)
    with pytest.raises(ValueError, match="Encrypted"):
        _extract("encrypted.pdf", buffer.getvalue())
    with pytest.raises(ValueError, match="100 pages"):
        _extract("long.pdf", pdf(*[""] * 101))


def test_parser_timeout_is_reported(monkeypatch):
    import subprocess

    class Process:
        pid = 12345678
        returncode = 0
        calls = 0

        def communicate(self, *args, **kwargs):
            self.calls += 1
            if self.calls == 1:
                raise subprocess.TimeoutExpired("parser", 120)
            return b"", None

    from app.services import document_parser

    monkeypatch.setattr(subprocess, "Popen", lambda *args, **kwargs: Process())
    monkeypatch.setattr(document_parser, "_kill_group", lambda pid: None)
    with pytest.raises(ValueError, match="timed out"):
        extract_document("spec.pdf", b"%PDF-")


def test_word_paragraph_location_survives_requirement_analysis():
    from datetime import UTC, datetime

    from app.schemas import Project, RequirementAnalysis
    from app.services.analyzer import analyze_requirements

    document = _extract(
        "rules.docx",
        docx(
            "<w:p><w:r><w:t>Context.</w:t></w:r></w:p>"
            "<w:p><w:r><w:t>Refunds return zero.</w:t></w:r></w:p>"
        ),
    )

    class Model:
        def parse(self, **kwargs):
            assert document.text in kwargs["prompt"]
            return RequirementAnalysis(
                requirements=[
                    RequirementItem(
                        id="R1",
                        text="Refunds return zero",
                        source_quote="Refunds return zero.",
                        testable=True,
                        ambiguity=None,
                    )
                ],
                notes="",
            )

    project = Project(
        id="p1",
        name="Task",
        requirements_text=document.text,
        requirement_document=document,
        created_at=datetime.now(UTC),
    )
    result = analyze_requirements(Model(), project, max_requirements=40)
    assert result.source_audit.links[0].locations[0].number == 2
    assert result.source_audit.links[0].locations[0].kind == "paragraph"
    assert result.source_audit.document.id == document.id


def test_import_body_limit(tmp_path):
    settings = Settings(database_path=tmp_path / "docs.db", llm_enabled=False, _env_file=None)
    with TestClient(create_app(settings)) as client:
        register(client)
        response = client.post("/api/v1/documents/import", content=b"a" * 7_100_001)
        assert response.status_code == 413


def test_editing_preserves_or_clears_locations_and_does_not_rewrite_old_reports(tmp_path):
    settings = Settings(database_path=tmp_path / "docs.db", llm_enabled=False, _env_file=None)
    with TestClient(create_app(settings)) as client:
        register(client)
        document = client.post(
            "/api/v1/documents/import",
            json={
                "filename": "original.pdf",
                "content_base64": base64.b64encode(pdf("Old rule.")).decode(),
            },
        ).json()
        project = client.post(
            "/api/v1/projects",
            json={
                "name": "Task",
                "requirements_text": document["text"],
                "requirement_document_id": document["id"],
            },
        ).json()
        url = f"/api/v1/projects/{project['id']}"
        updated = client.patch(url, json={"name": "Renamed"}).json()
        assert updated["requirement_document"] == document
        run = client.post(url + "/runs").json()
        wait_for_run(client, run["id"])
        updated = client.patch(url, json={"requirements_text": "Edited rule."}).json()
        assert updated["requirement_document"] is None
        assert updated["requirement_document_id"] is None
        assert (
            client.get(f"/api/v1/runs/{run['id']}/report").json()["requirement_document"]
            == document
        )
        html = client.get(f"/api/v1/runs/{run['id']}/report.html").text
        assert "original.pdf" in html and "Old rule." in html
        response = client.patch(url, json={"requirement_document_id": document["id"]})
        assert response.status_code == 422
        response = client.patch(
            url,
            json={"requirements_text": document["text"], "requirement_document_id": document["id"]},
        )
        assert response.status_code == 200
        assert response.json()["requirement_document"] == document


def test_unicode_offsets_are_code_points():
    document = _extract(
        "unicode.docx",
        docx(
            "<w:p><w:r><w:t>First 🧪.</w:t></w:r></w:p>"
            "<w:p><w:r><w:t>Second rule.</w:t></w:r></w:p>"
        ),
    )
    assert document.text[document.segments[1].start : document.segments[1].end] == "Second rule."
