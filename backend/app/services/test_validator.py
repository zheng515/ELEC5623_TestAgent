"""Match a restricted straight-line pytest subset to saved scenario contracts.

No generated code is executed here. Unsupported constructs remain reviewable but do
not earn coverage or execution eligibility. Matching the plan is not proof that the
plan itself is semantically correct or complete.
"""

import ast
import json
from dataclasses import dataclass

from app.schemas import GeneratedTest, RepositorySnapshot, TestPlan, ValidatedCheck

VALIDATION_VERSION = 2


class UnsupportedCheck(ValueError):
    pass


@dataclass
class ObservedCheck:
    function: str
    target: str
    arguments: list
    keywords: dict
    operator: str
    expected: object
    call_line: int
    assertion_line: int


def validate_test(test: GeneratedTest, plan: TestPlan, repository: RepositorySnapshot | None):
    issues = []
    matched = []
    scenarios = {scenario.id: scenario for scenario in plan.scenarios}
    try:
        if repository is None:
            raise UnsupportedCheck(
                "Repository interfaces are unavailable; target calls cannot be validated."
            )
        observed = _observe(test.code, repository)
        matched_indices = set()
        for scenario_id in test.scenario_ids:
            scenario = scenarios.get(scenario_id)
            if scenario is None or scenario.check is None:
                issues.append(f"{scenario_id}: no structured check contract was recorded.")
                continue
            if scenario.assumptions or scenario.preconditions:
                issues.append(
                    f"{scenario_id}: setup or assumptions need validation "
                    "beyond the supported subset."
                )
                continue
            contract = scenario.check
            expected = (
                contract.exception_type
                if contract.operator == "raises"
                else contract.expected_value
            )
            keywords = {item.name: item.value for item in contract.keyword_arguments}
            if len(keywords) != len(contract.keyword_arguments):
                issues.append(f"{scenario_id}: duplicate keyword arguments in the contract.")
                continue
            matches = [
                (index, check)
                for index, check in enumerate(observed)
                if check.target == contract.target
                and check.operator == contract.operator
                and _equal(check.arguments, contract.arguments)
                and _equal(check.keywords, keywords)
                and _equal(check.expected, expected)
            ]
            if not matches:
                issues.append(
                    f"{scenario_id}: no reachable check matches "
                    "the planned target, inputs and oracle."
                )
            matched.extend(
                ValidatedCheck(
                    scenario_id=scenario_id,
                    function_name=check.function,
                    target=check.target,
                    call_line=check.call_line,
                    assertion_line=check.assertion_line,
                )
                for _, check in matches
            )
            matched_indices.update(index for index, _ in matches)
        for index, check in enumerate(observed):
            if index not in matched_indices:
                issues.append(
                    f"{check.function}, line {check.assertion_line}: check of "
                    f"{check.target} has no matching linked scenario contract."
                )
        if not test.scenario_ids:
            issues.append("No scenario was linked to this artifact.")
    except (SyntaxError, UnsupportedCheck, ValueError, TypeError) as error:
        issues.append(str(error))
    # Both directions must match: every declared scenario and every observed check.
    return test.model_copy(
        update={
            "validation_status": "needs_review" if issues else "validated",
            "validation_issues": issues,
            "validated_checks": [] if issues else matched,
        }
    )


def validated_scenarios(test: GeneratedTest) -> set[str]:
    return (
        {check.scenario_id for check in test.validated_checks}
        if test.validation_status == "validated"
        else set()
    )


def _equal(left, right):
    # JSON comparison keeps bool, int and float distinct, unlike Python equality.
    return json.dumps(left, sort_keys=True, allow_nan=False) == json.dumps(
        right, sort_keys=True, allow_nan=False
    )


def _literal(node, variables):
    if isinstance(node, ast.Name) and node.id in variables:
        return variables[node.id]
    try:
        value = ast.literal_eval(node)
        json.dumps(value, allow_nan=False)
    except (ValueError, TypeError, SyntaxError) as error:
        raise UnsupportedCheck(
            "Inputs and expected values must resolve to JSON literals."
        ) from error
    if not _is_json(value):
        raise UnsupportedCheck("This literal type is outside the supported check subset.")
    return value


def _is_json(value):
    if type(value) in {str, int, float, bool, type(None)}:
        return True
    if isinstance(value, list):
        return all(_is_json(item) for item in value)
    if isinstance(value, dict):
        return all(isinstance(key, str) and _is_json(item) for key, item in value.items())
    return False


def _observe(code, repository):
    tree = ast.parse(code, feature_version=(3, 11))
    available = {
        f"{module.module}.{signature.split('(')[0]}": module.path
        for module in repository.modules
        for signature in module.functions
    }
    bindings = {}
    pytest_names = set()
    functions = []
    for node in tree.body:
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name == "*" or node.level:
                    raise UnsupportedCheck("Relative and wildcard imports need review.")
                name = alias.asname or alias.name
                target = f"{node.module}.{alias.name}"
                if target not in available:
                    raise UnsupportedCheck(f"Import {target} is not a known project function.")
                bindings[name] = target
        elif isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name.split(".")[0]
                if alias.name == "pytest":
                    pytest_names.add(name)
                elif any(target.startswith(alias.name + ".") for target in available):
                    bindings[name] = alias.name if alias.asname else name
                else:
                    raise UnsupportedCheck(f"Import {alias.name} needs review.")
        elif isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
            functions.append(node)
        elif (
            isinstance(node, ast.Expr)
            and isinstance(node.value, ast.Constant)
            and isinstance(node.value.value, str)
        ):
            continue
        else:
            raise UnsupportedCheck("Only imports and straight-line test functions are supported.")
    if not functions or len({node.name for node in functions}) != len(functions):
        raise UnsupportedCheck("Unique collectable test functions are required.")
    if set(bindings) & pytest_names:
        raise UnsupportedCheck("Import bindings must not shadow pytest.")
    if {function.name for function in functions} & (set(bindings) | pytest_names):
        raise UnsupportedCheck("Test definitions must not shadow imported functions.")
    checks = []
    for function in functions:
        if (
            function.decorator_list
            or function.returns is not None
            or any(argument.annotation is not None for argument in function.args.args)
            or function.args.defaults
            or function.args.kw_defaults
            or function.args.vararg
            or function.args.kwarg
        ):
            raise UnsupportedCheck("Decorators and dynamic function arguments need review.")
        arguments = {
            arg.arg
            for arg in [*function.args.args, *function.args.posonlyargs, *function.args.kwonlyargs]
        }
        used_names = {
            node.id
            for statement in function.body
            for node in ast.walk(statement)
            if isinstance(node, ast.Name)
        }
        if arguments & used_names:
            raise UnsupportedCheck("Fixture-dependent behavior needs review.")
        if arguments & (set(bindings) | pytest_names):
            raise UnsupportedCheck("Fixture arguments must not shadow imports.")
        variables, results = {}, {}
        checked_results = set()
        before = len(checks)
        for statement in function.body:
            if (
                isinstance(statement, ast.Assign)
                and len(statement.targets) == 1
                and isinstance(statement.targets[0], ast.Name)
            ):
                name = statement.targets[0].id
                if name in bindings or name in pytest_names or name in variables or name in results:
                    raise UnsupportedCheck("Rebinding inputs, results or imports needs review.")
                if isinstance(statement.value, ast.Call):
                    results[name] = _call(statement.value, bindings, available, variables)
                else:
                    variables[name] = _literal(statement.value, variables)
            elif isinstance(statement, ast.Assert):
                if statement.msg is not None:
                    try:
                        _literal(statement.msg, variables)
                    except UnsupportedCheck as error:
                        raise UnsupportedCheck(
                            f"{function.name}, line {statement.lineno}: "
                            "assertion messages must be literals, without extra calls."
                        ) from error
                comparison = statement.test
                if (
                    not isinstance(comparison, ast.Compare)
                    or len(comparison.ops) != 1
                    or not isinstance(comparison.ops[0], ast.Eq)
                ):
                    raise UnsupportedCheck(
                        "Only explicit equality or precise exception oracles are supported."
                    )
                left = comparison.left
                call = (
                    results.get(left.id)
                    if isinstance(left, ast.Name)
                    else _call(left, bindings, available, variables)
                )
                if call is None:
                    raise UnsupportedCheck(
                        "The assertion must check an actual project call result."
                    )
                if isinstance(left, ast.Name):
                    checked_results.add(left.id)
                expected = _literal(comparison.comparators[0], variables)
                checks.append(
                    ObservedCheck(
                        function.name, *call[:3], "equals", expected, call[3], statement.lineno
                    )
                )
            elif isinstance(statement, ast.With):
                if (
                    len(statement.items) != 1
                    or statement.items[0].optional_vars
                    or len(statement.body) != 1
                ):
                    raise UnsupportedCheck("Exception checks must contain one direct project call.")
                context = statement.items[0].context_expr
                if not (
                    isinstance(context, ast.Call)
                    and isinstance(context.func, ast.Attribute)
                    and isinstance(context.func.value, ast.Name)
                    and context.func.value.id in pytest_names
                    and context.func.attr == "raises"
                    and len(context.args) == 1
                    and not context.keywords
                    and isinstance(context.args[0], ast.Name)
                    and context.args[0].id
                    in {
                        "ValueError",
                        "TypeError",
                        "KeyError",
                        "RuntimeError",
                        "IndexError",
                        "ZeroDivisionError",
                        "OverflowError",
                        "Exception",
                    }
                ):
                    raise UnsupportedCheck(
                        "Only pytest.raises with a precise built-in exception is supported."
                    )
                if context.args[0].id in (set(bindings) | set(variables) | set(results)):
                    raise UnsupportedCheck("Exception types must not be rebound.")
                body = statement.body[0]
                if not isinstance(body, ast.Expr):
                    raise UnsupportedCheck("Exception checks must invoke the project directly.")
                call = _call(body.value, bindings, available, variables)
                checks.append(
                    ObservedCheck(
                        function.name,
                        *call[:3],
                        "raises",
                        context.args[0].id,
                        call[3],
                        statement.lineno,
                    )
                )
            elif (
                isinstance(statement, ast.Expr)
                and isinstance(statement.value, ast.Constant)
                and isinstance(statement.value.value, str)
            ):
                continue
            else:
                raise UnsupportedCheck(
                    "Control flow, mocks, helpers and indirect execution need review."
                )
        if len(checks) == before:
            raise UnsupportedCheck(f"{function.name}: no checked project result was found.")
        for name, call in results.items():
            if name not in checked_results:
                raise UnsupportedCheck(
                    f"{function.name}, line {call[3]}: call to {call[0]} saved as "
                    f"{name} has no checked result; setup calls need review."
                )
    return checks


def _call(node, bindings, available, variables):
    if not isinstance(node, ast.Call):
        raise UnsupportedCheck("A direct call to an inspected project function is required.")
    name = ast.unparse(node.func)
    root, *parts = name.split(".")
    target = ".".join([bindings.get(root, ""), *parts])
    if target not in available:
        raise UnsupportedCheck(f"Call {name} is not an inspected project function.")
    if len({keyword.arg for keyword in node.keywords}) != len(node.keywords):
        raise UnsupportedCheck("Duplicate keyword arguments are invalid.")
    if any(keyword.arg is None for keyword in node.keywords):
        raise UnsupportedCheck("Expanded keyword arguments need review.")
    return (
        target,
        [_literal(arg, variables) for arg in node.args],
        {keyword.arg: _literal(keyword.value, variables) for keyword in node.keywords},
        node.lineno,
    )
