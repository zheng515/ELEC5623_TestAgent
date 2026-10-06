"""GitHub repository downloads (FR4). A fake GitHub serves real archives; no network."""

import http.client
import io
import json
import tarfile
import tempfile
import urllib.error
import urllib.request
from datetime import UTC, datetime
from email.message import Message

import pytest
from conftest import register
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.core.config import Settings
from app.main import create_app
from app.schemas import Project, VerificationReport, VerificationRun
from app.services import github_source
from app.services.github_source import (
    GitHubError,
    GitHubLocation,
    contains_credentials,
    parse_github_url,
)
from app.services.inspector import RepositoryError, inspect_repository
from app.services.orchestrator import DirectLLMOrchestrator
from app.services.report_renderer import render_html_report

SHA = "a" * 40
TOP = f"example-shipping-{SHA[:7]}"
SHIPPING = '"""Shipping fees."""\n\n\ndef fee(amount_cents: int) -> int:\n    return 0\n'


def archive(entries) -> bytes:
    """A gzip tarball laid out as GitHub lays them out: one top-level directory."""
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        for name, content, kind in entries:
            info = tarfile.TarInfo(name)
            if kind == "dir":
                info.type, info.mode = tarfile.DIRTYPE, 0o755
                tar.addfile(info)
            elif kind == "symlink":
                info.type, info.linkname = tarfile.SYMTYPE, "../../etc/passwd"
                tar.addfile(info)
            else:
                data = content.encode()
                info.size, info.mode = len(data), 0o755 if kind == "exec" else 0o644
                tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


DEFAULT_ARCHIVE = [
    (TOP, "", "dir"),
    (f"{TOP}/shipping.py", SHIPPING, "file"),
    (f"{TOP}/run.sh", "#!/bin/sh\n", "exec"),
    (f"{TOP}/pkg", "", "dir"),
    (f"{TOP}/pkg/__init__.py", "", "file"),
    (f"{TOP}/pkg/orders.py", "def place(order):\n    return order\n", "file"),
    (f"{TOP}/node_modules", "", "dir"),
    (f"{TOP}/node_modules/big.js", "x" * 1000, "file"),
    (f"{TOP}/link.py", "", "symlink"),
]


class FakeGitHub:
    def __init__(self, entries=DEFAULT_ARCHIVE, refs=None, repository="example/shipping"):
        self.archive = archive(entries)
        self.refs = refs if refs is not None else {"main": SHA}
        self.repository = repository
        self.requests: list[urllib.request.Request] = []

    def __call__(self, request, timeout):
        self.requests.append(request)
        path = request.full_url.removeprefix(github_source.API_URL)
        if path == f"/repos/{self.repository}":
            body = {"full_name": self.repository, "default_branch": "main"}
            return io.BytesIO(json.dumps(body).encode())
        prefix = f"/repos/{self.repository}/commits/"
        if path.startswith(prefix):
            ref = urllib.request.unquote(path.removeprefix(prefix))
            if ref not in self.refs:
                raise http_error(request, 422)
            return io.BytesIO(self.refs[ref].encode())
        if path == f"/repos/{self.repository}/tarball/{SHA}":
            return io.BytesIO(self.archive)
        raise http_error(request, 404)


def http_error(request, status, **headers):
    message = Message()
    for key, value in headers.items():
        message[key] = value
    return urllib.error.HTTPError(request.full_url, status, "error", message, io.BytesIO(b"{}"))


@pytest.fixture
def github(monkeypatch):
    fake = FakeGitHub()
    monkeypatch.setattr(github_source, "_open", fake)
    return fake


@pytest.fixture
def settings(tmp_path):
    return Settings(_env_file=None, repository_snapshot_root=tmp_path / "snapshots")


@pytest.mark.parametrize(
    ("reference", "expected"),
    [
        ("https://github.com/example/shipping", GitHubLocation("example", "shipping")),
        ("https://github.com/example/shipping.git", GitHubLocation("example", "shipping")),
        ("https://www.github.com/example/shipping/", GitHubLocation("example", "shipping")),
        ("http://github.com/example/shipping?tab=readme", GitHubLocation("example", "shipping")),
        ("git@github.com:example/shipping.git", GitHubLocation("example", "shipping")),
        ("ssh://git@github.com/example/shipping.git", GitHubLocation("example", "shipping")),
        (
            "https://github.com/example/shipping/tree/feature/x/src",
            GitHubLocation("example", "shipping", ("feature", "x", "src")),
        ),
        (
            "https://github.com/example/shipping/commit/ABCDEF1",
            GitHubLocation("example", "shipping", ("abcdef1",)),
        ),
    ],
)
def test_github_urls_are_reduced_to_owner_repository_and_tree(reference, expected):
    assert parse_github_url(reference) == expected


@pytest.mark.parametrize(
    ("reference", "message"),
    [
        ("https://gitlab.com/example/shipping", "Only GitHub"),
        ("https://github.com.evil.example/example/shipping", "Only GitHub"),
        ("https://github.com/example", "does not name a repository"),
        ("https://github.com/example/shipping/issues/1", "does not name a repository or folder"),
        ("https://github.com/example/shipping/blob/main/shipping.py", "repository or folder"),
        ("https://github.com/-bad/shipping", "not valid"),
        ("https://github.com/example/..", "not valid"),
        ("https://github.com/example/shipping/tree/main/%2E%2E", "not valid"),
        ("https://user:secret@github.com/example/shipping", "must not contain credentials"),
        ("https://ghp_secret@github.com/example/shipping", "must not contain credentials"),
        ("https://github.com/example/shipping?access_token=secret", "credentials"),
    ],
)
def test_other_hosts_malformed_paths_and_credentials_are_refused(reference, message):
    with pytest.raises(GitHubError, match=message):
        parse_github_url(reference)


def test_only_embedded_secrets_count_as_credentials():
    assert contains_credentials("https://token@github.com/example/shipping")
    assert not contains_credentials("ssh://git@github.com/example/shipping.git")
    assert not contains_credentials("git@github.com:example/shipping.git")
    assert not contains_credentials("projects/user@example")


def test_a_github_url_is_downloaded_at_a_pinned_commit_and_inspected(github, settings):
    snapshot = inspect_repository("https://github.com/example/shipping", settings)

    assert snapshot.source.repository == "example/shipping"
    assert snapshot.source.requested_ref is None
    assert snapshot.source.ref == "main"
    assert snapshot.source.commit_sha == SHA
    assert snapshot.source.url == f"https://github.com/example/shipping/tree/{SHA}"
    assert snapshot.root == snapshot.source.url
    assert {module.module for module in snapshot.modules} == {"shipping", "pkg", "pkg.orders"}
    # The archive of exactly the resolved commit is requested, not the moving branch.
    assert github.requests[-1].full_url.endswith(f"/tarball/{SHA}")


def test_the_saved_snapshot_keeps_ordinary_files_only(github, settings):
    snapshot = inspect_repository("https://github.com/example/shipping", settings)

    files = {item.path: item for item in snapshot.artifact.files}
    assert set(files) == {"shipping.py", "run.sh", "pkg/__init__.py", "pkg/orders.py"}
    assert files["run.sh"].mode & 0o111
    assert not files["shipping.py"].mode & 0o111
    # Links are never unpacked, and that is recorded rather than silently dropped.
    assert any(item.startswith("link.py: symbolic link") for item in snapshot.skipped)


def test_the_download_is_deleted_once_the_snapshot_is_saved(github, settings, tmp_path):
    scratch = tmp_path / "scratch"
    scratch.mkdir()
    original = tempfile.tempdir
    tempfile.tempdir = str(scratch)
    try:
        inspect_repository("https://github.com/example/shipping", settings)
    finally:
        tempfile.tempdir = original

    assert list(scratch.iterdir()) == []


def test_a_branch_with_a_slash_and_a_folder_are_told_apart(github, settings):
    github.refs = {"feature/x": SHA}

    snapshot = inspect_repository(
        "https://github.com/example/shipping/tree/feature/x/pkg", settings
    )

    assert snapshot.source.ref == "feature/x"
    assert snapshot.source.subdirectory == "pkg"
    assert snapshot.source.url.endswith(f"/tree/{SHA}/pkg")
    assert [item.path for item in snapshot.artifact.files] == ["__init__.py", "orders.py"]


def test_a_missing_ref_folder_or_file_path_is_reported(github, settings):
    with pytest.raises(RepositoryError, match="No branch, tag or commit"):
        inspect_repository("https://github.com/example/shipping/tree/release", settings)
    with pytest.raises(RepositoryError, match="No folder 'docs'"):
        inspect_repository("https://github.com/example/shipping/tree/main/docs", settings)
    with pytest.raises(RepositoryError, match="is a file"):
        inspect_repository("https://github.com/example/shipping/tree/main/shipping.py", settings)


@pytest.mark.parametrize("name", ["../escape.py", "/etc/escape.py", f"other-{SHA[:7]}/x.py"])
def test_an_archive_with_an_unsafe_layout_is_refused_whole(monkeypatch, settings, tmp_path, name):
    entries = [(TOP, "", "dir"), (f"{TOP}/shipping.py", SHIPPING, "file"), (name, "x", "file")]
    monkeypatch.setattr(github_source, "_open", FakeGitHub(entries))

    with pytest.raises(RepositoryError, match="unsafe path|unexpected layout"):
        inspect_repository("https://github.com/example/shipping", settings)
    assert not (tmp_path / "escape.py").exists()


def test_archive_and_snapshot_limits_refuse_oversized_repositories(github, settings):
    small_archive = settings.model_copy(update={"github_max_archive_bytes": 100})
    with pytest.raises(RepositoryError, match="REQTEST_GITHUB_MAX_ARCHIVE_BYTES"):
        inspect_repository("https://github.com/example/shipping", small_archive)

    small_snapshot = settings.model_copy(update={"max_snapshot_bytes": 10})
    with pytest.raises(RepositoryError, match="byte limit exceeded"):
        inspect_repository("https://github.com/example/shipping", small_snapshot)


@pytest.mark.parametrize(
    ("status", "headers", "message"),
    [
        (404, {}, "was not found. If it is private, set REQTEST_GITHUB_TOKEN"),
        (403, {"x-ratelimit-remaining": "0"}, "rate limit"),
        (429, {}, "rate limit"),
        (401, {}, "requires authentication"),
        (500, {}, "HTTP 500"),
    ],
)
def test_github_errors_are_explained(monkeypatch, settings, status, headers, message):
    def failing(request, timeout):
        raise http_error(request, status, **headers)

    monkeypatch.setattr(github_source, "_open", failing)

    with pytest.raises(RepositoryError, match=message):
        inspect_repository("https://github.com/example/shipping", settings)


@pytest.mark.parametrize(
    ("error", "message"),
    [
        (urllib.error.URLError("no route"), "could not be reached: no route"),
        (TimeoutError(), "REQTEST_GITHUB_TIMEOUT_SECONDS"),
        (http.client.RemoteDisconnected("closed"), "could not be reached"),
        (http.client.BadStatusLine("garbage"), "could not be reached"),
    ],
)
def test_network_failures_are_explained(monkeypatch, settings, error, message):
    def failing(request, timeout):
        raise error

    monkeypatch.setattr(github_source, "_open", failing)

    with pytest.raises(RepositoryError, match=message):
        inspect_repository("https://github.com/example/shipping", settings)


def test_the_token_is_sent_to_the_api_only(github, settings):
    inspect_repository("https://github.com/example/shipping", settings)
    assert all(request.get_header("Authorization") is None for request in github.requests)

    github.requests.clear()
    with_token = settings.model_copy(update={"github_token": SecretStr("ghp_example")})
    inspect_repository("https://github.com/example/shipping", with_token)

    for request in github.requests:
        assert request.get_header("Authorization") == "Bearer ghp_example"
        # Unredirected headers are not copied onto a redirect to another host.
        assert "Authorization" in request.unredirected_hdrs


def test_redirects_leave_github_hosts_only_by_refusal():
    handler = github_source._GitHubRedirects()
    request = urllib.request.Request("https://api.github.com/repos/example/shipping/tarball/x")

    allowed = handler.redirect_request(
        request, io.BytesIO(), 302, "Found", Message(), "https://codeload.github.com/archive"
    )
    assert allowed.full_url == "https://codeload.github.com/archive"
    for target in ["https://evil.example/archive", "http://codeload.github.com/archive"]:
        with pytest.raises(GitHubError, match="unexpected host"):
            handler.redirect_request(request, io.BytesIO(), 302, "Found", Message(), target)


def test_a_project_with_a_credential_url_is_refused_without_echoing_it(tmp_path):
    settings = Settings(database_path=tmp_path / "a.db", sandbox_enabled=False, _env_file=None)
    with TestClient(create_app(settings)) as client:
        register(client)
        response = client.post(
            "/api/v1/projects",
            json={
                "name": "Shipping",
                "requirements_text": "Orders of at least 100 have free shipping.",
                "repository_ref": "https://ghp_secret@github.com/example/shipping",
            },
        )
        assert response.status_code == 422
        assert "must not contain credentials" in response.json()["detail"]
        assert "ghp_secret" not in response.text
        assert client.get("/api/v1/projects").json() == []


def test_the_html_report_names_the_downloaded_commit(github, settings):
    snapshot = inspect_repository("https://github.com/example/shipping/tree/main/pkg", settings)
    now = datetime.now(UTC)
    project = Project(
        id="project",
        name="Shipping",
        requirements_text="Orders of at least 100 have free shipping.",
        repository_ref="https://github.com/example/shipping/tree/main/pkg",
        created_at=now,
    )
    run = VerificationRun(
        id="run",
        project_id=project.id,
        created_at=now,
        input_sha256="0" * 64,
        events=[],
        report=VerificationReport(summary="Done", repository=snapshot),
    )

    html = render_html_report(project, run)

    assert "Downloaded from GitHub" in html
    assert SHA in html
    assert f'href="https://github.com/example/shipping/tree/{SHA}/pkg"' in html


def test_a_run_records_which_github_commit_it_read_without_a_local_root(github, settings):
    assert settings.repository_root is None
    project = Project(
        id="project",
        name="Shipping",
        requirements_text="Orders of at least 100 have free shipping.",
        repository_ref="https://github.com/example/shipping",
        created_at=datetime.now(UTC),
    )
    events = []

    snapshot, issues = DirectLLMOrchestrator(object(), settings=settings)._inspect(project, events)

    assert snapshot.source.commit_sha == SHA
    assert issues == []
    assert any(f"at commit {SHA[:12]} (main)" in event.message for event in events)
