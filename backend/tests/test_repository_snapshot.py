"""Source provenance must cover implementation bytes and every execution attempt."""

import json

import pytest

from app.core.config import Settings
from app.services.inspector import RepositoryError, inspect_repository
from app.services.repository_snapshot import (
    SnapshotError,
    capture_repository,
    snapshot_store,
    verified_snapshot_root,
)


@pytest.fixture
def repository(tmp_path):
    root = tmp_path / "project"
    root.mkdir()
    (root / "shipping.py").write_text("def fee(amount_cents: int) -> int:\n    return 0\n")
    return root


@pytest.fixture
def settings(tmp_path):
    return Settings(repository_root=tmp_path, _env_file=None)


def test_body_only_edit_changes_content_fingerprint_but_not_interface(repository, settings):
    before = inspect_repository(str(repository), settings)
    (repository / "shipping.py").write_text("def fee(amount_cents: int) -> int:\n    return 999\n")
    after = inspect_repository(str(repository), settings)
    assert before.sha256 == after.sha256
    assert before.artifact.content_sha256 != after.artifact.content_sha256
    saved = verified_snapshot_root(before.artifact, settings)
    assert "return 0" in (saved / "shipping.py").read_text()
    assert saved != repository


def test_snapshot_retains_data_files_empty_directories_and_manifest(repository, settings):
    (repository / "data").mkdir()
    (repository / "data" / "rates.json").write_text('{"rate": 5}')
    (repository / "empty").mkdir()
    artifact, saved = capture_repository(repository, settings)
    assert (saved / "data" / "rates.json").read_text() == '{"rate": 5}'
    assert (saved / "empty").is_dir()
    manifest = json.loads((saved.parent / "manifest.json").read_text())
    assert manifest["content_sha256"] == artifact.content_sha256
    assert set(item.path for item in artifact.files) == {"shipping.py", "data/rates.json"}
    assert verified_snapshot_root(artifact, settings) == saved


def test_executable_permission_is_preserved_without_write_permission(repository, settings):
    script = repository / "helper.sh"
    script.write_text("#!/bin/sh\nexit 0\n")
    script.chmod(0o755)
    artifact, saved = capture_repository(repository, settings)
    assert (saved / "helper.sh").stat().st_mode & 0o777 == 0o555
    assert (saved / "shipping.py").stat().st_mode & 0o777 == 0o444
    assert verified_snapshot_root(artifact, settings) == saved


def test_content_hash_changes_when_only_a_data_file_changes(repository, settings):
    data = repository / "rules.json"
    data.write_text('{"threshold": 100}')
    before, _ = capture_repository(repository, settings)
    data.write_text('{"threshold": 200}')
    after, _ = capture_repository(repository, settings)
    assert before.content_sha256 != after.content_sha256


@pytest.mark.parametrize("change", ["modify", "delete", "add", "symlink", "directory"])
def test_modified_or_incomplete_saved_copy_is_rejected(repository, settings, change):
    artifact, saved = capture_repository(repository, settings)
    saved.chmod(0o700)
    file = saved / "shipping.py"
    if change == "modify":
        file.chmod(0o644)
        file.write_text("def fee(amount_cents): return 42\n")
        file.chmod(0o444)
    elif change == "delete":
        file.unlink()
    elif change == "add":
        (saved / "new.py").write_text("pass\n")
    elif change == "symlink":
        file.unlink()
        file.symlink_to(repository / "shipping.py")
    else:
        (saved / "new-directory").mkdir()
    with pytest.raises(SnapshotError):
        verified_snapshot_root(artifact, settings)


def test_missing_and_legacy_snapshots_cannot_use_live_files(repository, settings):
    with pytest.raises(SnapshotError, match="No saved code snapshot"):
        verified_snapshot_root(None, settings)
    artifact, saved = capture_repository(repository, settings)
    artifact = artifact.model_copy(update={"id": "../project"})
    with pytest.raises(SnapshotError, match="invalid metadata"):
        verified_snapshot_root(artifact, settings)
    saved.chmod(0o700)
    (saved / "shipping.py").unlink()
    saved.rmdir()
    with pytest.raises(SnapshotError):
        verified_snapshot_root(artifact.model_copy(update={"id": saved.parent.name}), settings)


@pytest.mark.parametrize("limit", ["files", "bytes"])
def test_limits_refuse_partial_snapshots_and_remove_failed_copy(repository, settings, limit):
    (repository / "another.py").write_text("pass\n")
    limited = settings.model_copy(
        update={
            "max_snapshot_files": 1 if limit == "files" else 100,
            "max_snapshot_bytes": 1 if limit == "bytes" else 10000,
        }
    )
    with pytest.raises(RepositoryError, match="limit exceeded"):
        inspect_repository(str(repository), limited)
    assert list(snapshot_store(settings).iterdir()) == []


def test_symlinks_and_generated_directories_are_recorded_but_not_copied(
    repository, settings, tmp_path
):
    secret = tmp_path / "outside.txt"
    secret.write_text("outside data")
    (repository / "link.txt").symlink_to(secret)
    (repository / "linked-dir").symlink_to(tmp_path, target_is_directory=True)
    (repository / "node_modules").mkdir()
    (repository / "node_modules" / "ignored.py").write_text("pass\n")
    artifact, saved = capture_repository(repository, settings)
    assert not (saved / "link.txt").exists()
    assert not (saved / "node_modules").exists()
    assert any("link.txt" in path for path in artifact.excluded)
    assert any("linked-dir" in path for path in artifact.excluded)
    assert verified_snapshot_root(artifact, settings) == saved


def test_changes_during_capture_prevent_inspection_of_a_mixed_copy(
    repository, settings, monkeypatch
):
    from app.services import repository_snapshot

    original = repository_snapshot._scan
    calls = 0

    def change_after_copy(*args, **kwargs):
        nonlocal calls
        result = original(*args, **kwargs)
        calls += 1
        if calls == 1:
            (repository / "shipping.py").write_text("def fee(amount_cents): return 123\n")
        return result

    monkeypatch.setattr(repository_snapshot, "_scan", change_after_copy)
    with pytest.raises(RepositoryError, match="changed while capturing"):
        inspect_repository(str(repository), settings)
    assert list(snapshot_store(settings).iterdir()) == []


def test_snapshot_store_inside_repository_is_excluded_to_prevent_recursive_copy(
    repository, settings
):
    settings = settings.model_copy(update={"repository_snapshot_root": repository / "snapshots"})
    artifact, saved = capture_repository(repository, settings)
    assert len(artifact.files) == 1
    assert not (saved / "snapshots").exists()
    assert any("snapshots/" in item for item in artifact.excluded)
