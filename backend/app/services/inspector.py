"""Read-only inspection of the project under test (FR4).

A repository reference is user input, so this is a trust boundary. Inspection is off
until `REQTEST_REPOSITORY_ROOT` is configured, every path must resolve inside that
root, symlinks are never followed, and only the importable surface of each module is
read: signatures, class names and docstrings, never whole file bodies.
"""

import ast
import hashlib
import os
from pathlib import Path

from app.core.config import Settings
from app.schemas import ModuleInterface, RepositorySnapshot

SKIPPED_DIRECTORIES = {
    ".git",
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
MAX_FILE_BYTES = 200_000
DOCSTRING_LIMIT = 200


class RepositoryError(RuntimeError):
    """The reference is missing, outside the configured root, or unreadable."""


def repository_available(settings: Settings) -> bool:
    return settings.repository_root is not None


def inspect_repository(reference: str, settings: Settings) -> RepositorySnapshot:
    root = _resolve(reference, settings)
    modules: list[ModuleInterface] = []
    skipped: list[str] = []
    budget = settings.max_inspected_bytes
    truncated = False

    for path in _python_files(root, skipped):
        if len(modules) >= settings.max_inspected_files or budget <= 0:
            truncated = True
            break
        size = path.stat().st_size
        if size > MAX_FILE_BYTES:
            skipped.append(f"{_relative(path, root)}: larger than {MAX_FILE_BYTES} bytes")
            continue
        interface = _interface(path, root, skipped)
        if interface is not None:
            modules.append(interface)
            budget -= size

    return RepositorySnapshot(
        root=str(root),
        modules=modules,
        skipped=skipped,
        truncated=truncated,
        sha256=_digest(modules),
    )


def _resolve(reference: str, settings: Settings) -> Path:
    """Reject anything that is not a real directory inside the configured root."""
    root = settings.repository_root
    if root is None:
        raise RepositoryError(
            "Repository inspection is not configured. Set REQTEST_REPOSITORY_ROOT to the "
            "directory that project repositories live under."
        )
    if "://" in reference or reference.startswith("git@"):
        raise RepositoryError(
            "Remote repositories are not cloned. Provide a local path inside "
            f"{root} instead of a URL."
        )

    allowed = Path(root).expanduser().resolve()
    candidate = Path(reference).expanduser()
    candidate = candidate if candidate.is_absolute() else allowed / candidate
    resolved = candidate.resolve()
    if not resolved.is_relative_to(allowed):
        raise RepositoryError(f"The repository path must be inside {allowed}.")
    if not resolved.is_dir():
        raise RepositoryError(f"No directory was found at {resolved}.")
    return resolved


def _python_files(root: Path, skipped: list[str]):
    """Walk the tree in a stable order, never following a symlink out of it."""
    for directory, subdirectories, filenames in os.walk(root, followlinks=False):
        subdirectories[:] = sorted(
            name
            for name in subdirectories
            if name not in SKIPPED_DIRECTORIES and not Path(directory, name).is_symlink()
        )
        for filename in sorted(filenames):
            path = Path(directory, filename)
            if path.suffix != ".py":
                continue
            if path.is_symlink():
                skipped.append(f"{_relative(path, root)}: symbolic link")
                continue
            yield path


def _interface(path: Path, root: Path, skipped: list[str]) -> ModuleInterface | None:
    relative = _relative(path, root)
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"))
    except (OSError, SyntaxError, UnicodeDecodeError) as error:
        skipped.append(f"{relative}: {type(error).__name__}")
        return None

    constants, functions, classes = [], [], []
    for node in tree.body:
        if isinstance(node, ast.Assign):
            constants.extend(
                target.id
                for target in node.targets
                if isinstance(target, ast.Name) and not target.id.startswith("_")
            )
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            if not node.target.id.startswith("_"):
                constants.append(node.target.id)
        elif isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            if not node.name.startswith("_"):
                functions.append(_signature(node))
        elif isinstance(node, ast.ClassDef):
            if not node.name.startswith("_"):
                classes.append(_class(node))

    module = _module_name(path, root)
    if not module:
        # The root directory's own __init__.py; nothing imports it from the mount root.
        skipped.append(f"{relative}: package marker of the repository root")
        return None

    return ModuleInterface(
        module=module,
        path=relative,
        docstring=(ast.get_docstring(tree) or "")[:DOCSTRING_LIMIT],
        constants=constants,
        functions=functions,
        classes=classes,
    )


def _signature(node: ast.FunctionDef | ast.AsyncFunctionDef) -> str:
    returns = f" -> {ast.unparse(node.returns)}" if node.returns else ""
    summary = (ast.get_docstring(node) or "").strip().splitlines()
    suffix = f"  # {summary[0][:120]}" if summary else ""
    return f"{node.name}({ast.unparse(node.args)}){returns}{suffix}"


def _class(node: ast.ClassDef) -> str:
    methods = [
        _signature(member)
        for member in node.body
        if isinstance(member, ast.FunctionDef | ast.AsyncFunctionDef)
        and not member.name.startswith("_")
    ]
    bases = ", ".join(ast.unparse(base) for base in node.bases)
    header = f"{node.name}({bases})" if bases else node.name
    return f"{header}: " + ("; ".join(methods) if methods else "no public methods")


def _module_name(path: Path, root: Path) -> str:
    parts = path.relative_to(root).with_suffix("").parts
    if parts[-1] == "__init__":
        parts = parts[:-1]
    return ".".join(parts)


def _relative(path: Path, root: Path) -> str:
    return str(path.relative_to(root))


def _digest(modules: list[ModuleInterface]) -> str:
    """Fingerprint the interfaces so a run can be tied to what it actually read."""
    joined = "\n".join(module.model_dump_json() for module in modules)
    return hashlib.sha256(joined.encode()).hexdigest()
