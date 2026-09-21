"""Repository inspection tests (FR4). Nothing outside the configured root is readable."""

import pytest

from app.core.config import Settings
from app.services.inspector import RepositoryError, inspect_repository, repository_available

SOURCE = '''"""Shipping fees."""

FREE_THRESHOLD = 10000
_INTERNAL = 1


def fee(amount_cents: int, *, express: bool = False) -> int:
    """Return the shipping fee in cents."""
    return 0


def _helper():
    pass


class Order:
    """An order."""

    def total(self) -> int: ...

    def _private(self): ...
'''


@pytest.fixture
def repository(tmp_path):
    root = tmp_path / "repo"
    (root / "pkg").mkdir(parents=True)
    (root / "shipping.py").write_text(SOURCE)
    (root / "pkg" / "__init__.py").write_text("")
    (root / "pkg" / "orders.py").write_text("def place(x):\n    return x\n")
    return root


@pytest.fixture
def settings(tmp_path):
    return Settings(repository_root=tmp_path, _env_file=None)


def test_only_the_public_interface_is_read(repository, settings):
    snapshot = inspect_repository("repo", settings)

    module = next(m for m in snapshot.modules if m.module == "shipping")
    assert module.docstring == "Shipping fees."
    assert module.constants == ["FREE_THRESHOLD"]
    assert module.functions == [
        "fee(amount_cents: int, *, express: bool=False) -> int  # Return the shipping fee in cents."
    ]
    assert module.classes == ["Order: total(self) -> int"]
    # Private names and whole file bodies are never sent to the model.
    assert "_INTERNAL" not in str(module)
    assert "_helper" not in str(module)
    assert "return 0" not in str(module)


def test_modules_are_named_as_they_would_be_imported(repository, settings):
    snapshot = inspect_repository("repo", settings)

    assert sorted(m.module for m in snapshot.modules) == ["pkg", "pkg.orders", "shipping"]


def test_generated_noise_is_not_inspected(repository, settings):
    for directory in (".venv", "node_modules", "__pycache__", ".git"):
        (repository / directory).mkdir()
        (repository / directory / "junk.py").write_text("def junk(): ...")

    snapshot = inspect_repository("repo", settings)

    assert all("junk" not in module.module for module in snapshot.modules)


def test_an_unparsable_file_is_skipped_rather_than_failing_the_run(repository, settings):
    (repository / "broken.py").write_text("def (:\n")

    snapshot = inspect_repository("repo", settings)

    assert any("broken.py: SyntaxError" in entry for entry in snapshot.skipped)
    assert any(module.module == "shipping" for module in snapshot.modules)


def test_a_symlink_cannot_be_used_to_read_outside_the_repository(repository, settings, tmp_path):
    outside = tmp_path / "secrets"
    outside.mkdir()
    (outside / "private.py").write_text("TOKEN = 'secret'")
    (repository / "escape.py").symlink_to(outside / "private.py")
    (repository / "escape_dir").symlink_to(outside)

    snapshot = inspect_repository("repo", settings)

    assert "secret" not in str(snapshot)
    assert all("private" not in module.path for module in snapshot.modules)


@pytest.mark.parametrize(
    "reference",
    [
        "https://github.com/example/project.git",
        "git@github.com:example/project.git",
        "../../../etc",
        "/etc",
    ],
)
def test_a_reference_outside_the_root_is_refused(reference, settings):
    with pytest.raises(RepositoryError):
        inspect_repository(reference, settings)


def test_inspection_is_off_until_a_root_is_configured():
    unconfigured = Settings(_env_file=None)

    assert repository_available(unconfigured) is False
    with pytest.raises(RepositoryError, match="REQTEST_REPOSITORY_ROOT"):
        inspect_repository("repo", unconfigured)


def test_a_missing_directory_is_reported_clearly(settings):
    with pytest.raises(RepositoryError, match="No directory"):
        inspect_repository("absent", settings)


def test_a_large_repository_is_truncated_rather_than_silently_trimmed(repository, tmp_path):
    for index in range(10):
        (repository / f"module_{index}.py").write_text("def f(): ...")
    limited = Settings(repository_root=tmp_path, max_inspected_files=3, _env_file=None)

    snapshot = inspect_repository("repo", limited)

    assert len(snapshot.modules) == 3
    assert snapshot.truncated is True


def test_the_digest_changes_when_the_interface_changes(repository, settings):
    before = inspect_repository("repo", settings).sha256
    (repository / "shipping.py").write_text(SOURCE + "\n\ndef refund(x):\n    return x\n")

    assert inspect_repository("repo", settings).sha256 != before
