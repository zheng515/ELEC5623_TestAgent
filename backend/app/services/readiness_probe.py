"""Trusted dependency/layout checker, executed only inside the pinned container.

This file's source is passed to python -I -c; project files are data. It never
imports project modules, runs setup.py, installs packages or follows requirements
instructions as commands. Relative dependency includes remain inside /repo.
"""

import ast
import importlib.machinery
import importlib.metadata
import json
import pathlib
import sys
import tomllib

from packaging.markers import default_environment
from packaging.requirements import InvalidRequirement, Requirement
from packaging.specifiers import InvalidSpecifier, SpecifierSet


def main():
    payload = json.loads(sys.argv[1])
    root = pathlib.Path("/repo")
    roots = payload["import_roots"]
    checks, notes = [], []
    seen = set()

    def check(kind, subject, status, detail):
        checks.append(dict(kind=kind, subject=subject, status=status, detail=detail))

    def dependency(value, source):
        try:
            requirement = Requirement(value)
        except InvalidRequirement:
            check(
                "dependency",
                source,
                "unknown",
                "Unsupported dependency declaration; no installation was attempted.",
            )
            return
        marker_environment = default_environment()
        marker_environment["extra"] = ""
        if requirement.marker and not requirement.marker.evaluate(marker_environment):
            check("dependency", value, "passed", "Marker does not apply to this runtime.")
            return
        if requirement.url:
            check(
                "dependency",
                value,
                "unknown",
                "Direct URL or local dependency provenance cannot be verified "
                "from installed versions.",
            )
            return
        try:
            installed = importlib.metadata.distribution(requirement.name)
        except importlib.metadata.PackageNotFoundError:
            check(
                "dependency",
                value,
                "failed",
                "Not installed in the pinned image. Add this dependency to "
                "a custom sandbox image and rebuild it.",
            )
            return
        if requirement.specifier and not requirement.specifier.contains(
            installed.version, prereleases=True
        ):
            check(
                "dependency",
                value,
                "failed",
                f"Installed version {installed.version} does not satisfy the declaration. "
                "Rebuild the sandbox with compatible versions.",
            )
            return
        key = (requirement.name.lower(), tuple(sorted(requirement.extras)))
        check("dependency", value, "passed", f"Installed version: {installed.version}.")
        if key in seen:
            return
        seen.add(key)
        extras = requirement.extras or {""}
        for child in installed.requires or []:
            try:
                parsed = Requirement(child)
                applies = not parsed.marker or any(
                    parsed.marker.evaluate({**marker_environment, "extra": extra})
                    for extra in extras
                )
                if applies:
                    dependency(str(parsed).split(";", 1)[0], requirement.name)
            except (InvalidRequirement, ValueError):
                check(
                    "dependency",
                    requirement.name,
                    "unknown",
                    "Installed dependency metadata could not be evaluated.",
                )
        provided = {item.lower() for item in installed.metadata.get_all("Provides-Extra", [])}
        if any(extra.lower() not in provided for extra in requirement.extras):
            check(
                "dependency",
                value,
                "unknown",
                "Requested extra is not declared by the installed distribution.",
            )

    visited = set()

    def requirements(path):
        path = path.resolve()
        if not path.is_relative_to(root) or not path.is_file():
            check(
                "dependency",
                str(path),
                "unknown",
                "Requirements include is missing or outside the snapshot.",
            )
            return
        if path in visited:
            return
        visited.add(path)
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except (OSError, UnicodeError):
            check("dependency", path.name, "unknown", "Requirements file could not be read.")
            return
        for line in lines:
            value = line.strip().split(" #", 1)[0].strip()
            if not value or value.startswith("#"):
                continue
            if value.startswith("-r ") or value.startswith("--requirement "):
                requirements(path.parent / value.split(maxsplit=1)[1])
            elif value.startswith("-") or value.endswith("\\"):
                check(
                    "dependency",
                    path.name,
                    "unknown",
                    "Unsupported requirement option, constraint, editable dependency "
                    "or multiline declaration.",
                )
            else:
                dependency(value, path.name)

    pyproject = root / "pyproject.toml"
    if pyproject.is_file():
        try:
            config = tomllib.loads(pyproject.read_text(encoding="utf-8"))
            project = config.get("project", {})
            for value in project.get("dependencies", []):
                dependency(value, "pyproject.toml")
            if "dependencies" in project.get("dynamic", []):
                check(
                    "dependency",
                    "pyproject.toml",
                    "unknown",
                    "Dynamic dependencies cannot be evaluated without executing build code.",
                )
            if (
                not project
                and ("poetry" in config.get("tool", {}) or "build-system" in config)
                and not (root / "requirements.txt").is_file()
            ):
                check(
                    "dependency",
                    "pyproject.toml",
                    "unknown",
                    "No static PEP 621 runtime dependencies were declared; "
                    "build-only or alternative metadata needs review.",
                )
            if project.get("requires-python"):
                constraint = SpecifierSet(project["requires-python"])
                version = ".".join(map(str, sys.version_info[:3]))
                check(
                    "python",
                    project["requires-python"],
                    "passed" if constraint.contains(version) else "failed",
                    f"Pinned image Python version: {version}.",
                )
        except (ValueError, TypeError, AttributeError, KeyError, InvalidSpecifier, OSError):
            check(
                "dependency",
                "pyproject.toml",
                "unknown",
                "Project metadata is invalid or unsupported.",
            )
    if (root / "requirements.txt").is_file():
        requirements(root / "requirements.txt")
    if not pyproject.is_file() and not (root / "requirements.txt").is_file():
        notes.append(
            "No supported runtime dependency manifest. "
            "Only unconditional imports in inspected modules were checked."
        )
        if (root / "setup.py").is_file() or (root / "setup.cfg").is_file():
            check(
                "dependency",
                "setup metadata",
                "unknown",
                "Legacy setup metadata is not executed or interpreted.",
            )

    search = [str(root / relative) for relative in roots]
    check(
        "layout",
        ", ".join(roots),
        "passed",
        "These relative import roots will be used for execution.",
    )
    if not payload["modules"]:
        check(
            "layout",
            "Python modules",
            "failed",
            "No inspectable Python module was found. Select the project source directory.",
        )
    module_names = {}
    for name, relative in payload["modules"]:
        if name.split(".")[0] in {"pytest", "pluggy", "packaging", *sys.stdlib_module_names}:
            check(
                "layout",
                name,
                "failed",
                "Source module shadows the sandbox runtime. "
                "Use a project package namespace or select a narrower source directory.",
            )
        if name in module_names:
            check(
                "layout",
                name,
                "failed",
                f"Conflicting module paths: {module_names[name]} and {relative}. "
                "Select one source directory.",
            )
        module_names[name] = relative
    for _, relative in payload["modules"]:
        try:
            tree = ast.parse((root / relative).read_text(encoding="utf-8"))
        except (OSError, SyntaxError, UnicodeError):
            check("import", relative, "unknown", "Module could not be parsed for import checks.")
            continue
        for node in tree.body:
            names = []
            if isinstance(node, ast.Import):
                names = [item.name.split(".")[0] for item in node.names]
            elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
                names = [node.module.split(".")[0]]
            for name in names:
                if name in sys.stdlib_module_names or name in sys.builtin_module_names:
                    continue
                spec = importlib.machinery.PathFinder.find_spec(name, search + sys.path)
                check(
                    "import",
                    f"{relative}: {name}",
                    "passed" if spec else "failed",
                    "Import root is discoverable without importing project code."
                    if spec
                    else "Import root is missing from the snapshot and image. "
                    "Add the dependency to the sandbox or select the correct project directory.",
                )
    notes.append(
        "Checks do not execute project imports or prove startup readiness. "
        "Conditional imports, services and native system dependencies are not validated."
    )
    notes.append(
        "Only default project dependencies are checked; optional project extras are not selected. "
        "Unresolved metadata needs static PEP 621 dependencies "
        "or simple requirements.txt declarations."
    )
    status = "blocked" if any(item["status"] != "passed" for item in checks) else "ready"
    print(json.dumps(dict(status=status, checks=checks, notes=notes, import_roots=roots)))


if __name__ == "__main__":
    main()
