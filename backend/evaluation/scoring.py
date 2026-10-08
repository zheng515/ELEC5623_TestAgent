"""Report misses and unsafe acceptance without treating API failures as safe decisions.

The explicit-quantity check is deliberately narrow: it catches numbers and common
units absent from the full specification, allowing one rule to clarify another. It
does not decide whether a value was attached to the right requirement or relationship.
"""

import re
from decimal import Decimal

_QUANTITY = re.compile(
    r"(?<![\w.])(?P<dollar>\$)?(?P<number>[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)"
    r"(?:\.\d+)?)"
    r"[ \t]*(?P<unit>kilometers?|meters?|kilograms?|grams?|dollars?|cents?|"
    r"days?|hours?|minutes?|seconds?|percent|%)?(?!\w)",
    re.IGNORECASE,
)

# Values use a fixed base unit within each dimension. Unknown units are deliberately
# not inferred; an unqualified number cannot establish a unit the source did not give.
_UNIT_FACTORS = {
    "cent": ("currency", Decimal(1)),
    "dollar": ("currency", Decimal(100)),
    "second": ("duration", Decimal(1)),
    "minute": ("duration", Decimal(60)),
    "hour": ("duration", Decimal(3600)),
    "day": ("duration", Decimal(86400)),
    "gram": ("mass", Decimal(1)),
    "kilogram": ("mass", Decimal(1000)),
    "meter": ("length", Decimal(1)),
    "kilometer": ("length", Decimal(1000)),
    "percent": ("percent", Decimal(1)),
    "%": ("percent", Decimal(1)),
}


def _quantities(text):
    """Return explicit literal spans and comparable values."""
    found = []
    for match in _QUANTITY.finditer(text):
        unit = (match.group("unit") or "").lower()
        if match.group("dollar"):
            if unit and unit.rstrip("s") != "dollar":
                # A conflicting prefix/suffix is not a supported conversion.
                found.append((match.group(), ("conflicting_unit", match.group().lower())))
                continue
            unit = unit or "dollar"
        singular = unit.rstrip("s") if unit not in {"%", "percent"} else unit
        dimension, factor = _UNIT_FACTORS.get(singular, ("unqualified", Decimal(1)))
        number = Decimal(match.group("number").replace(",", ""))
        found.append((match.group(), (dimension, number * factor)))
    return found


def _unsupported_quantities(source, restatement):
    # Repetition can be a harmless explanatory conversion or restatement. Matching
    # occurrences would reject those normal rewrites, so only novel values are flagged.
    available = {value for _, value in _quantities(source)}
    return [literal for literal, value in _quantities(restatement) if value not in available]


def score_analysis(case, requirements):
    assignments = [[] for _ in case.rules]
    unexpected = []
    merged = []
    for requirement in requirements:
        matches = [
            index for index, rule in enumerate(case.rules) if rule.quote in requirement.source_quote
        ]
        if len(matches) == 1:
            assignments[matches[0]].append(requirement)
        elif len(matches) > 1:
            merged.append(requirement.id)
        else:
            unexpected.append(requirement.id)
    recovered = correct = passed_checks = false_testable = missed_ambiguity = 0
    missing, duplicates, mismatches, literal_mismatches = [], [], [], []
    for rule, candidates in zip(case.rules, assignments, strict=True):
        if not candidates:
            missing.append(rule.quote)
            continue
        recovered += 1
        if len(candidates) != 1:
            duplicates.append(rule.quote)
            continue
        candidate = candidates[0]
        # A restatement may legitimately clarify a rule using a threshold stated
        # elsewhere in the same specification. The quote still determines which
        # gold rule this candidate represents; quantity provenance uses all input.
        unsupported = _unsupported_quantities(case.specification, candidate.text)
        if unsupported:
            literal_mismatches.append(
                {
                    "requirement_id": candidate.id,
                    "source_quote": rule.quote,
                    "quantity_source": "full_specification",
                    "restatement": candidate.text,
                    "unsupported": unsupported,
                }
            )
        ambiguous = bool(candidate.ambiguity and candidate.ambiguity.strip())
        classification_correct = (
            candidate.testable == rule.testable and ambiguous == rule.ambiguous
        )
        if classification_correct:
            correct += 1
        else:
            mismatches.append(rule.quote)
        # Preserve the classification-only measure, while ensuring a literal error
        # cannot make the overall source-aligned checks appear complete.
        passed_checks += int(classification_correct and not unsupported)
        false_testable += int(candidate.testable and not rule.testable)
        missed_ambiguity += int(rule.ambiguous and not ambiguous)
    return {
        "gold_rules": len(case.rules),
        "returned_requirements": len(requirements),
        "recovered_rules": recovered,
        "correctly_classified_rules": correct,
        "rules_passing_current_checks": passed_checks,
        "missing_rules": missing,
        "duplicate_rules": duplicates,
        "merged_requirement_ids": merged,
        "unexpected_requirement_ids": unexpected,
        "classification_mismatches": mismatches,
        "false_testable_rules": false_testable,
        "missed_ambiguity_rules": missed_ambiguity,
        "literal_mismatches": literal_mismatches,
    }


def summarize(records):
    analysis = [item for item in records if item["stage"] == "analysis"]
    oracle = [item for item in records if item["stage"] == "oracle"]
    results = [item["score"] for item in analysis if item["error"] is None]
    gold = sum(item["gold_rules"] for item in analysis)
    evaluated_gold = sum(item["gold_rules"] for item in results)
    supported = [item for item in oracle if item["expected_verdict"] == "supported"]
    unsupported = [item for item in oracle if item["expected_verdict"] != "supported"]
    answered = [item for item in oracle if item["error"] is None]
    answered_supported = [item for item in supported if item["error"] is None]
    answered_unsupported = [item for item in unsupported if item["error"] is None]
    confusion = {
        verdict: dict.fromkeys(["supported", "contradicted", "insufficient", "no_decision"], 0)
        for verdict in ["supported", "contradicted", "insufficient"]
    }
    for item in oracle:
        confusion[item["expected_verdict"]][item["predicted_verdict"] or "no_decision"] += 1
    returned = sum(item["returned_requirements"] for item in results)
    return {
        "samples": len(records),
        "errors": sum(item["error"] is not None for item in records),
        "analysis": {
            "samples": len(analysis),
            "gold_rules": gold,
            "evaluated_gold_rules": evaluated_gold,
            "decision_coverage": ratio(len(results), len(analysis)),
            "rule_recall": ratio(sum(item["recovered_rules"] for item in results), evaluated_gold),
            "source_aligned_classification_accuracy": ratio(
                sum(item["correctly_classified_rules"] for item in results), evaluated_gold
            ),
            "source_aligned_check_pass_rate": ratio(
                sum(item["rules_passing_current_checks"] for item in results), evaluated_gold
            ),
            "source_aligned_precision": ratio(
                sum(item["recovered_rules"] for item in results), returned
            ),
            "missing_rules": sum(len(item["missing_rules"]) for item in results),
            "false_testable_rules": sum(item["false_testable_rules"] for item in results),
            "missed_ambiguity_rules": sum(item["missed_ambiguity_rules"] for item in results),
            "literal_mismatches": sum(len(item["literal_mismatches"]) for item in results),
            "errors": sum(item["error"] is not None for item in analysis),
        },
        "oracle": {
            "samples": len(oracle),
            "verdict_accuracy": ratio(
                sum(item["expected_verdict"] == item["predicted_verdict"] for item in answered),
                len(answered),
            ),
            "decision_coverage": ratio(len(answered), len(oracle)),
            "false_acceptances": sum(item["eligible"] for item in unsupported),
            "false_acceptance_rate": ratio(
                sum(item["eligible"] for item in answered_unsupported), len(answered_unsupported)
            ),
            "false_rejections": sum(
                not item["eligible"] and item["error"] is None for item in supported
            ),
            "supported_case_errors": sum(item["error"] is not None for item in supported),
            "unsupported_case_errors": sum(item["error"] is not None for item in unsupported),
            "false_rejection_rate": ratio(
                sum(not item["eligible"] for item in answered_supported), len(answered_supported)
            ),
            "confusion_matrix": confusion,
            "errors": sum(item["error"] is not None for item in oracle),
        },
    }


def ratio(numerator, denominator):
    return round(numerator / denominator, 4) if denominator else None
