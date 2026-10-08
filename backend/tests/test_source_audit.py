"""Missing source text must remain visible despite full extracted-item coverage."""

import pytest

from app.schemas import RequirementItem
from app.services.source_audit import audit_source


def requirement(quote, identifier="R1"):
    return RequirementItem(
        id=identifier, text="Rule", source_quote=quote, testable=True, ambiguity=None
    )


def audit(source, requirements, limit=10, returned=None):
    return audit_source(
        source,
        requirements,
        extraction_limit=limit,
        returned_requirements=len(requirements) if returned is None else returned,
    )


def test_omitted_rule_and_partial_quote_remain_unlinked():
    result = audit("Orders ship free. Refunds take 5 days.", [requirement("Orders ship free.")])
    assert [f.text for f in result.unlinked_fragments] == ["Refunds take 5 days."]
    assert result.semantic_completeness == "not_established"
    partial = audit("Refunds take 5 days.", [requirement("Refunds")])
    assert partial.unlinked_fragments[0].text == "take 5 days."


def test_repeated_and_overlapping_quotes_do_not_credit_all_occurrences():
    for source, quote in [("A rule.\nA rule.", "A rule."), ("ababa", "aba")]:
        result = audit(source, [requirement(quote)])
        assert result.links == []
        assert result.ambiguous_requirement_ids == ["R1"]
        assert result.unlinked_fragments


def test_overlapping_unique_links_merge_without_creating_false_gaps():
    result = audit("abcdef", [requirement("abcd"), requirement("cdef", "R2")])
    assert not result.unlinked_fragments
    assert len(result.links) == 2
    assert result.semantic_completeness == "not_established"


def test_shared_quote_keeps_all_requirement_links():
    result = audit(
        "One compound rule.",
        [requirement("One compound rule."), requirement("One compound rule.", "R2")],
    )
    assert result.links[0].requirement_ids == ["R1", "R2"]
    assert not result.unlinked_fragments
    assert any("not whether every rule" in issue for issue in result.issues)


def test_broad_quote_cannot_hide_a_second_line_from_review():
    source = "Orders ship free.\nRefunds take 5 days."
    result = audit(source, [requirement(source)])

    # The quote covers every character, but that does not establish two rules were
    # extracted. Preserve the lexical link and make the manual check explicit.
    assert result.unlinked_fragments == []
    assert result.links[0].text == source
    assert any(
        "R1" in issue and "2 potential rule units" in issue and "lines 1-2" in issue
        and "Review each unit" in issue
        for issue in result.issues
    )
    assert result.semantic_completeness == "not_established"


def test_broad_quote_on_one_line_is_also_flagged():
    source = "Orders ship free. Refunds take 5 days."
    result = audit(source, [requirement(source)])
    assert any("2 potential rule units at line 1" in issue for issue in result.issues)


def test_single_rule_quote_has_no_broad_quote_warning():
    result = audit("Orders ship free.", [requirement("Orders ship free.")])
    assert not any("potential rule units" in issue for issue in result.issues)


def test_unicode_offsets_and_line_numbers_reproduce_exact_input():
    source = "Price: £5.\n\nReturn within 7 days.\n  Other rule."
    result = audit(source, [requirement("Return within 7 days.")])
    assert result.links[0].line == 3
    assert [f.line for f in result.unlinked_fragments] == [1, 4]
    for item in [*result.links, *result.unlinked_fragments]:
        assert source[item.start : item.end] == item.text


@pytest.mark.parametrize("returned", [2, 3])
def test_limit_is_visible_even_when_all_text_is_linked(returned):
    result = audit("Rule", [requirement("Rule")], limit=2, returned=returned)
    assert result.limit_reached
    assert result.returned_requirements == returned
    assert result.retained_requirements == 1
    assert any("limit" in issue for issue in result.issues)


def test_empty_extraction_leaves_every_nonempty_line_unlinked():
    result = audit("Rule one.\n\nRule two.", [])
    assert len(result.unlinked_fragments) == 2
    assert not result.limit_reached


def test_analyzer_audits_retained_items_after_actual_truncation():
    from test_agent import PROJECT, FakeLLM

    from app.schemas import RequirementAnalysis
    from app.services.analyzer import analyze_requirements

    source = "Rule one. Rule two."
    project = PROJECT.model_copy(update={"requirements_text": source})
    response = RequirementAnalysis(
        requirements=[requirement("Rule one."), requirement("Rule two.", "R2")], notes=""
    )
    result = analyze_requirements(FakeLLM(response), project, max_requirements=1)
    assert result.source_audit.returned_requirements == 2
    assert result.source_audit.retained_requirements == 1
    assert result.source_audit.limit_reached
    assert result.source_audit.unlinked_fragments[0].text == "Rule two."


def test_analyzer_surfaces_broad_quote_that_only_describes_first_rule():
    from test_agent import PROJECT, FakeLLM

    from app.schemas import RequirementAnalysis
    from app.services.analyzer import analyze_requirements

    source = "Orders ship free.\nRefunds take 5 days."
    project = PROJECT.model_copy(update={"requirements_text": source})
    response = RequirementAnalysis(
        requirements=[
            RequirementItem(
                id="R1",
                text="Orders ship free.",
                source_quote=source,
                testable=True,
                ambiguity=None,
            )
        ],
        notes="",
    )

    result = analyze_requirements(FakeLLM(response), project, max_requirements=10)

    assert result.source_audit.unlinked_fragments == []
    assert any("Review each unit" in issue for issue in result.source_audit.issues)
    assert result.source_audit.semantic_completeness == "not_established"
