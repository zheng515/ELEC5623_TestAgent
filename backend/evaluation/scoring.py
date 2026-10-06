"""Report misses and unsafe acceptance without treating API failures as safe decisions."""


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
    recovered = correct = false_testable = missed_ambiguity = 0
    missing, duplicates, mismatches = [], [], []
    for rule, candidates in zip(case.rules, assignments, strict=True):
        if not candidates:
            missing.append(rule.quote)
            continue
        recovered += 1
        if len(candidates) != 1:
            duplicates.append(rule.quote)
            continue
        candidate = candidates[0]
        ambiguous = bool(candidate.ambiguity and candidate.ambiguity.strip())
        if candidate.testable == rule.testable and ambiguous == rule.ambiguous:
            correct += 1
        else:
            mismatches.append(rule.quote)
        false_testable += int(candidate.testable and not rule.testable)
        missed_ambiguity += int(rule.ambiguous and not ambiguous)
    return {
        "gold_rules": len(case.rules),
        "returned_requirements": len(requirements),
        "recovered_rules": recovered,
        "correctly_classified_rules": correct,
        "missing_rules": missing,
        "duplicate_rules": duplicates,
        "merged_requirement_ids": merged,
        "unexpected_requirement_ids": unexpected,
        "classification_mismatches": mismatches,
        "false_testable_rules": false_testable,
        "missed_ambiguity_rules": missed_ambiguity,
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
            "source_aligned_precision": ratio(
                sum(item["recovered_rules"] for item in results), returned
            ),
            "missing_rules": sum(len(item["missing_rules"]) for item in results),
            "false_testable_rules": sum(item["false_testable_rules"] for item in results),
            "missed_ambiguity_rules": sum(item["missed_ambiguity_rules"] for item in results),
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
