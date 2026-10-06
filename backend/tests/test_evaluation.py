"""Verify evaluation accounting and replay integrity without network access."""

import json

import pytest
from pydantic import ValidationError

from app.schemas import OracleReview, RequirementAnalysis, RequirementItem
from app.services.llm import LLMError
from evaluation.__main__ import main, save_report
from evaluation.corpus import Corpus, load_corpus
from evaluation.runner import failed, make_report, markdown_report, run_case
from evaluation.scoring import score_analysis, summarize


class ResponseLLM:
    def __init__(self, response):
        self.response = response
        self.prompts = []

    def parse(self, *, system, prompt, output_format):
        self.prompts.append(prompt)
        if isinstance(self.response, Exception):
            raise self.response
        assert isinstance(self.response, output_format)
        return self.response


def analysis_response(case, *, omit_last=False):
    rules = case.rules[:-1] if omit_last else case.rules
    return RequirementAnalysis(
        requirements=[
            RequirementItem(
                id=f"R{index}",
                text=rule.quote,
                source_quote=rule.quote,
                testable=rule.testable,
                ambiguity="The stated detail is missing." if rule.ambiguous else None,
            )
            for index, rule in enumerate(rules, start=1)
        ],
        notes="Synthetic scorer fixture.",
    )


def oracle_response(case, verdict):
    return OracleReview(
        decisions=[
            {
                "scenario_id": case.scenario.id,
                "verdict": verdict,
                "rationale": "Synthetic scorer fixture, not a live semantic assessment.",
                "citations": [
                    {"requirement_id": item.id, "quote": item.source_quote}
                    for item in case.requirements
                ],
            }
        ]
    )


def test_corpus_sources_and_categories_are_valid():
    corpus, fingerprint = load_corpus()
    assert len(corpus.analysis) == 9
    assert len(corpus.oracle) == 15
    assert len(fingerprint) == 64
    assert {item.expected_verdict for item in corpus.oracle} == {
        "supported",
        "contradicted",
        "insufficient",
    }
    assert {"units", "boundary", "exceptions", "conflict", "prompt_injection"} <= {
        item.category for item in corpus.oracle
    }


def test_omitted_rule_reduces_recall_instead_of_reporting_complete_coverage():
    corpus, _ = load_corpus()
    case = next(item for item in corpus.analysis if item.id == "analysis_omitted_rule")
    record = run_case(case, "analysis", 1, llm=ResponseLLM(analysis_response(case, omit_last=True)))
    summary = summarize([record])["analysis"]
    assert summary["rule_recall"] == 0.5
    assert summary["missing_rules"] == 1
    assert failed(record)


def test_broad_quote_cannot_hide_merged_or_omitted_business_rules():
    corpus, _ = load_corpus()
    case = corpus.analysis[0]
    merged = RequirementItem(
        id="R1",
        text="Merged rules.",
        source_quote=case.specification,
        testable=True,
        ambiguity=None,
    )
    score = score_analysis(case, [merged])
    assert score["recovered_rules"] == 0
    assert score["merged_requirement_ids"] == ["R1"]
    assert len(score["missing_rules"]) == 2


def test_false_testable_and_missed_ambiguity_are_counted():
    corpus, _ = load_corpus()
    case = corpus.analysis[1]
    response = analysis_response(case)
    response.requirements[0].testable = True
    response.requirements[0].ambiguity = None
    record = run_case(case, "analysis", 1, llm=ResponseLLM(response))
    summary = summarize([record])["analysis"]
    assert summary["false_testable_rules"] == 1
    assert summary["missed_ambiguity_rules"] == 1
    assert summary["source_aligned_classification_accuracy"] == 0


def test_duplicate_rules_reduce_precision_and_fail_the_sample():
    corpus, _ = load_corpus()
    case = corpus.analysis[1]
    response = analysis_response(case)
    response.requirements.append(response.requirements[0].model_copy(update={"id": "R2"}))
    record = run_case(case, "analysis", 1, llm=ResponseLLM(response))
    assert summarize([record])["analysis"]["source_aligned_precision"] == 0.5
    assert failed(record)


def test_verbatim_citation_can_still_be_a_false_semantic_acceptance():
    corpus, _ = load_corpus()
    case = next(item for item in corpus.oracle if item.id == "oracle_wrong_fee")
    record = run_case(case, "oracle", 1, llm=ResponseLLM(oracle_response(case, "supported")))
    assert record["eligible"] is True
    score = summarize([record])["oracle"]
    assert score["false_acceptances"] == 1
    assert score["false_acceptance_rate"] == 1
    assert score["confusion_matrix"]["contradicted"]["supported"] == 1
    assert failed(record)


def test_model_errors_do_not_count_as_successful_rejections():
    corpus, _ = load_corpus()
    case = corpus.oracle[0]
    record = run_case(case, "oracle", 1, llm=ResponseLLM(LLMError("Model unavailable.")))
    score = summarize([record])["oracle"]
    assert record["error"] == "Model unavailable."
    assert score["errors"] == 1
    assert score["supported_case_errors"] == 1
    assert score["false_rejections"] == 0
    assert score["verdict_accuracy"] is None
    assert score["decision_coverage"] == 0
    assert failed(record)


def test_empty_stage_metrics_are_unknown():
    summary = summarize([])
    assert summary["analysis"]["rule_recall"] is None
    assert summary["oracle"]["verdict_accuracy"] is None
    assert summary["oracle"]["false_acceptance_rate"] is None


def test_api_failure_cannot_dilute_false_acceptance_rate():
    corpus, _ = load_corpus()
    case = next(item for item in corpus.oracle if item.id == "oracle_wrong_fee")
    unsafe = run_case(case, "oracle", 1, llm=ResponseLLM(oracle_response(case, "supported")))
    unavailable = run_case(case, "oracle", 2, llm=ResponseLLM(LLMError("Unavailable.")))
    score = summarize([unsafe, unavailable])["oracle"]
    assert score["false_acceptance_rate"] == 1
    assert score["decision_coverage"] == 0.5
    assert score["unsupported_case_errors"] == 1


def test_analysis_api_failure_is_not_reported_as_a_semantic_score():
    corpus, _ = load_corpus()
    record = run_case(corpus.analysis[0], "analysis", 1, llm=ResponseLLM(LLMError("Unavailable.")))
    score = summarize([record])["analysis"]
    assert score["rule_recall"] is None
    assert score["source_aligned_classification_accuracy"] is None
    assert score["decision_coverage"] == 0
    assert score["gold_rules"] == 2
    assert score["evaluated_gold_rules"] == 0


def test_replay_cannot_overwrite_input(tmp_path):
    with pytest.raises(SystemExit):
        main(
            [
                "--mode",
                "replay",
                "--responses",
                str(tmp_path / "input.json"),
                "--output",
                str(tmp_path / "input.json"),
            ]
        )


@pytest.mark.parametrize("stage", ["analysis", "oracle"])
def test_gold_labels_are_absent_from_model_requests(stage):
    corpus, _ = load_corpus()
    case = corpus.analysis[0] if stage == "analysis" else corpus.oracle[0]
    response = (
        analysis_response(case) if stage == "analysis" else oracle_response(case, "supported")
    )
    llm = ResponseLLM(response)
    run_case(case, stage, 1, llm=llm)
    prompt = llm.prompts[0]
    assert "expected_verdict" not in prompt
    assert '"rules"' not in prompt
    assert case.id not in prompt


def test_replay_scores_saved_responses_and_detects_changed_requests(tmp_path):
    corpus, fingerprint = load_corpus()
    case = corpus.oracle[0]
    record = run_case(case, "oracle", 1, llm=ResponseLLM(oracle_response(case, "supported")))
    input_file = tmp_path / "recorded.json"
    save_report(
        input_file, make_report([record], corpus_sha256=fingerprint, mode="synthetic", model=None)
    )
    output = tmp_path / "replayed.json"
    arguments = [
        "--mode",
        "replay",
        "--case",
        case.id,
        "--responses",
        str(input_file),
        "--output",
        str(output),
    ]
    assert main(arguments) == 0
    report = json.loads(output.read_text())
    assert report["mode"] == "replay"
    assert report["complete"] is True
    assert report["summary"]["oracle"]["verdict_accuracy"] == 1
    assert output.with_suffix(".md").exists()
    changed = json.loads(input_file.read_text())
    changed["records"][0]["calls"][0]["request_sha256"] = "changed"
    input_file.write_text(json.dumps(changed))
    assert main(arguments) == 1
    assert json.loads(output.read_text())["summary"]["errors"] == 1


def test_replay_rejects_changed_corpus_and_missing_samples(tmp_path):
    corpus, fingerprint = load_corpus()
    input_file = tmp_path / "old.json"
    report = make_report([], corpus_sha256="old", mode="synthetic", model=None)
    input_file.write_text(json.dumps(report))
    args = [
        "--mode",
        "replay",
        "--case",
        corpus.oracle[0].id,
        "--responses",
        str(input_file),
        "--output",
        str(tmp_path / "new.json"),
    ]
    assert main(args) == 2
    report["corpus_sha256"] = fingerprint
    input_file.write_text(json.dumps(report))
    assert main(args) == 1


def test_dry_run_never_creates_client_or_score(monkeypatch, capsys):
    def forbidden(*args, **kwargs):
        raise AssertionError("Dry run must not initialize model access.")

    monkeypatch.setattr("evaluation.__main__.create_llm", forbidden)
    assert main([]) == 0
    assert "No quality score measured" in capsys.readouterr().out


def test_live_without_credentials_exits_without_manufacturing_results(monkeypatch, tmp_path):
    monkeypatch.setattr("evaluation.__main__.create_llm", lambda settings: None)
    output = tmp_path / "live.json"
    assert main(["--mode", "live", "--limit", "1", "--output", str(output)]) == 2
    assert not output.exists()


def test_partial_report_is_marked_incomplete():
    report = make_report(
        [],
        corpus_sha256="hash",
        mode="live",
        model="test-model",
        expected_samples=24,
        complete=False,
    )
    assert report["complete"] is False
    assert report["summary"]["samples"] == 0
    assert "Complete: False; planned samples: 24" in markdown_report(report)


def test_invalid_gold_sources_are_rejected():
    corpus, _ = load_corpus()
    data = corpus.model_dump(mode="json")
    data["analysis"][0]["rules"][0]["quote"] = "Not in the original text."
    with pytest.raises(ValidationError, match="gold quote"):
        Corpus.model_validate(data)


def test_seeded_demo_reports_an_omission_and_unsafe_acceptance(tmp_path):
    from evaluation.corpus import DEFAULT_CORPUS

    output = tmp_path / "demo.json"
    assert (
        main(
            [
                "--mode",
                "replay",
                "--case",
                "analysis_omitted_rule",
                "--case",
                "oracle_wrong_fee",
                "--responses",
                str(DEFAULT_CORPUS.parent / "fixtures/demo-responses.json"),
                "--output",
                str(output),
            ]
        )
        == 1
    )
    report = json.loads(output.read_text())
    assert report["response_origin"] == "synthetic"
    assert report["summary"]["analysis"]["rule_recall"] == 0.5
    assert report["summary"]["oracle"]["false_acceptances"] == 1
    assert report["summary"]["errors"] == 0
    assert report["failed_samples"] == 2
