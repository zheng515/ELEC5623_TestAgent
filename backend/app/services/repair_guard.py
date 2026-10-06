"""Conservative structural protection for automatic test repairs.

This permits one narrow transformation, not arbitrary semantic rewriting: removing
an unused fixture argument named by a recorded missing-fixture error. The complete
remaining module AST must match, including assertions, inputs, imports, helper
functions, decorators, control flow and calls. Unparseable originals cannot establish
a protected baseline. This is not proof of requirement coverage or test adequacy.
"""

import ast
import copy
import re

from app.schemas import ExecutedTest, GeneratedTest, RepositorySnapshot


class UnsafeRepair(ValueError):
    pass


def validate_repair(
    original: GeneratedTest,
    replacement: GeneratedTest,
    errors: list[ExecutedTest],
    repository: RepositorySnapshot,
) -> None:
    try:
        before = ast.parse(original.code)
        after = ast.parse(replacement.code)
    except SyntaxError as error:
        raise UnsafeRepair("Cannot establish a valid AST baseline for this repair.") from error

    tests = [
        node
        for node in ast.walk(before)
        if isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef)
        and node.name.startswith("test_")
    ]
    if not tests or not all(_has_checks(test) for test in tests):
        raise UnsafeRepair("The original test lacks a nonconstant check to preserve.")
    if not _calls_project(before, repository):
        raise UnsafeRepair("The original module has no identifiable project API call.")

    if any(
        isinstance(node, ast.Name)
        and node.id in {"locals", "globals", "vars", "eval", "exec", "compile", "__import__"}
        for node in ast.walk(before)
    ):
        raise UnsafeRepair("Dynamic namespace access cannot establish an unused fixture.")

    missing = {
        match.group(1)
        for error in errors
        if error.test_id == original.id and error.outcome == "error"
        for match in re.finditer(r"fixture '([^']+)' not found", error.message)
    }
    protected = copy.deepcopy(before)
    removed = False
    for node in ast.walk(protected):
        if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
            continue
        if not node.name.startswith("test_"):
            continue
        # Defaults and special argument kinds are outside this narrowly supported repair.
        if node.args.defaults or node.args.posonlyargs:
            continue
        used = {
            item.id
            for statement in node.body
            for item in ast.walk(statement)
            if isinstance(item, ast.Name)
        }
        kept = [
            argument
            for argument in node.args.args
            if argument.arg not in missing
            or argument.arg in used
            or argument.annotation is not None
        ]
        removed |= len(kept) != len(node.args.args)
        node.args.args = kept
    if not removed or ast.dump(protected) != ast.dump(after):
        raise UnsafeRepair(
            "Repair must only remove an unused fixture parameter identified by the error; "
            "test bodies, assertions, inputs, calls, imports and decorators must stay unchanged."
        )


def _has_checks(test: ast.FunctionDef | ast.AsyncFunctionDef) -> bool:
    for node in ast.walk(test):
        if isinstance(node, ast.Assert) and any(
            isinstance(item, ast.Name | ast.Call | ast.Attribute | ast.Subscript)
            for item in ast.walk(node.test)
        ):
            return True
        if isinstance(node, ast.With | ast.AsyncWith):
            if any(
                isinstance(item.context_expr, ast.Call)
                and isinstance(item.context_expr.func, ast.Attribute)
                and item.context_expr.func.attr == "raises"
                for item in node.items
            ):
                return True
    return False


def _calls_project(tree: ast.Module, repository: RepositorySnapshot) -> bool:
    modules = {module.module for module in repository.modules}
    functions, aliases = set(), set()
    for node in tree.body:
        if isinstance(node, ast.ImportFrom) and node.module in modules:
            functions.update(alias.asname or alias.name for alias in node.names)
        elif isinstance(node, ast.Import):
            aliases.update(
                alias.asname or alias.name.split(".")[0]
                for alias in node.names
                if alias.name in modules
            )
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        target = node.func
        if isinstance(target, ast.Name) and target.id in functions:
            return True
        if isinstance(target, ast.Attribute):
            while isinstance(target, ast.Attribute):
                target = target.value
            if isinstance(target, ast.Name) and target.id in aliases:
                return True
    return False
