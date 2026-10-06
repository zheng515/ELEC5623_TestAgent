"""Persist bounded code copies and check their byte manifest before execution."""

import hashlib
import json
import os
import shutil
import stat
from pathlib import Path
from uuid import UUID, uuid4

from app.core.config import Settings
from app.schemas import CodeSnapshot, SnapshotFile

SKIPPED_DIRECTORIES = {
    ".git",
    ".tools",
    ".next",
    ".wrangler",
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".tox",
    ".mypy_cache",
    ".pytest_cache",
    ".ruff_cache",
    "dist",
    "build",
    ".eggs",
}


class SnapshotError(RuntimeError):
    """No stable, complete copy could be captured, or its integrity was lost."""


def snapshot_store(settings: Settings) -> Path:
    configured = settings.repository_snapshot_root
    return (
        (configured or settings.database_path.parent / "repository-snapshots")
        .expanduser()
        .resolve()
    )


def _manifest_hash(files: list[SnapshotFile], directories: list[str]) -> str:
    payload = json.dumps(
        {"files": [item.model_dump() for item in files], "directories": directories},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _scan(
    root: Path,
    settings: Settings,
    *,
    destination: Path | None = None,
    excluded_root: Path | None = None,
    exclude_noise: bool = True,
) -> tuple[list[SnapshotFile], list[str], list[str]]:
    files, directories, excluded = [], [], []
    total = 0

    # fwalk pins directory descriptors. O_NOFOLLOW also refuses a file changed to
    # a symlink between enumeration and reading; no untrusted code is imported.
    def walk_error(error):
        raise SnapshotError(f"Repository could not be read: {error.strerror}.")

    for directory, subdirs, names, descriptor in os.fwalk(
        root,
        follow_symlinks=False,
        onerror=walk_error,
    ):
        relative_directory = Path(directory).relative_to(root)
        kept = []
        for name in sorted(subdirs):
            path = Path(directory, name)
            relative = (relative_directory / name).as_posix()
            info = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
            if (exclude_noise and name in SKIPPED_DIRECTORIES) or path == excluded_root:
                excluded.append(f"{relative}/: excluded directory")
            elif stat.S_ISLNK(info.st_mode):
                excluded.append(f"{relative}/: symbolic link")
            else:
                kept.append(name)
                directories.append(relative)
                if len(files) + len(directories) > settings.max_snapshot_files:
                    raise SnapshotError(
                        "Repository snapshot entry limit exceeded; no partial copy is used."
                    )
                if destination:
                    (destination / relative).mkdir()
        subdirs[:] = kept
        for name in sorted(names):
            relative = (relative_directory / name).as_posix()
            info = os.stat(name, dir_fd=descriptor, follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode):
                excluded.append(f"{relative}: symbolic link or special file")
                continue
            if len(files) + len(directories) >= settings.max_snapshot_files:
                raise SnapshotError(
                    "Repository snapshot entry limit exceeded; no partial copy is used."
                )
            remaining = settings.max_snapshot_bytes - total
            if info.st_size > remaining:
                raise SnapshotError(
                    "Repository snapshot byte limit exceeded; no partial copy is used."
                )
            with os.fdopen(
                os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=descriptor), "rb"
            ) as stream:
                before = os.fstat(stream.fileno())
                if not stat.S_ISREG(before.st_mode):
                    raise SnapshotError(
                        "Repository file type changed while capturing the snapshot."
                    )
                content = stream.read(remaining + 1)
                after = os.fstat(stream.fileno())
            if len(content) > remaining:
                raise SnapshotError(
                    "Repository snapshot byte limit exceeded; no partial copy is used."
                )
            if (before.st_size, before.st_mtime_ns, before.st_ctime_ns) != (
                after.st_size,
                after.st_mtime_ns,
                after.st_ctime_ns,
            ):
                raise SnapshotError(
                    "Repository changed while capturing the snapshot; retry with stable files."
                )
            mode = 0o444 | (stat.S_IMODE(before.st_mode) & 0o111)
            if not exclude_noise and stat.S_IMODE(before.st_mode) != mode:
                raise SnapshotError("Saved code snapshot file permissions changed.")
            total += len(content)
            files.append(
                SnapshotFile(
                    path=relative,
                    size=len(content),
                    sha256=hashlib.sha256(content).hexdigest(),
                    mode=mode,
                )
            )
            if destination:
                (destination / relative).write_bytes(content)
        if len(files) + len(directories) > settings.max_snapshot_files:
            raise SnapshotError(
                "Repository snapshot entry limit exceeded; no partial copy is used."
            )
    return sorted(files, key=lambda item: item.path), sorted(directories), sorted(excluded)


def capture_repository(root: Path, settings: Settings) -> tuple[CodeSnapshot, Path]:
    store = snapshot_store(settings)
    if store == root:
        raise SnapshotError("Snapshot storage must be separate from the repository root.")
    identifier = uuid4().hex
    artifact_directory = store / identifier
    source = artifact_directory / "source"
    try:
        artifact_directory.mkdir(parents=True, mode=0o700)
        source.mkdir(mode=0o700)
        files, directories, excluded = _scan(
            root, settings, destination=source, excluded_root=store
        )
        # Check a second full scan, including additions and deletions. This catches
        # edits during copying; it is not an atomic filesystem transaction.
        current_files, current_directories, current_excluded = _scan(
            root, settings, excluded_root=store
        )
        if (files, directories, excluded) != (current_files, current_directories, current_excluded):
            raise SnapshotError(
                "Repository changed while capturing the snapshot; retry with stable files."
            )
        artifact = CodeSnapshot(
            id=identifier,
            content_sha256=_manifest_hash(files, directories),
            files=files,
            directories=directories,
            excluded=excluded,
        )
        (artifact_directory / "manifest.json").write_text(
            artifact.model_dump_json(), encoding="utf-8"
        )
        for item in files:
            (source / item.path).chmod(item.mode)
        for directory in sorted(directories, key=lambda value: value.count("/"), reverse=True):
            (source / directory).chmod(0o555)
        source.chmod(0o555)
        return artifact, source
    except (OSError, SnapshotError) as error:
        # No partially captured artifact can become an execution input.
        if source.exists():
            for directory, _, _ in os.walk(source):
                Path(directory).chmod(0o700)
        shutil.rmtree(artifact_directory, ignore_errors=True)
        if isinstance(error, SnapshotError):
            raise
        raise SnapshotError(
            f"Repository snapshot could not be captured: {error.strerror}."
        ) from error


def verified_snapshot_root(artifact: CodeSnapshot | None, settings: Settings) -> Path:
    if artifact is None:
        raise SnapshotError(
            "No saved code snapshot exists; execution against the live repository is refused."
        )
    try:
        if UUID(artifact.id).hex != artifact.id:
            raise ValueError("Invalid snapshot id")
        store = snapshot_store(settings)
        directory = store / artifact.id
        source = directory / "source"
        if directory.is_symlink() or source.is_symlink() or not source.is_dir():
            raise SnapshotError("Saved code snapshot is missing or has an unsafe path.")
        files, directories, excluded = _scan(source, settings, exclude_noise=False)
        if excluded or files != artifact.files or directories != artifact.directories:
            raise SnapshotError(
                "Saved code snapshot integrity check failed; execution results cannot be trusted."
            )
        if _manifest_hash(files, directories) != artifact.content_sha256:
            raise SnapshotError("Saved code snapshot fingerprint does not match its manifest.")
        return source
    except (OSError, ValueError) as error:
        raise SnapshotError(
            "Saved code snapshot is missing, unreadable, or has invalid metadata."
        ) from error
