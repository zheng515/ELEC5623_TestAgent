"""Exercise production analysis/review stages; never run generated project code."""

import hashlib
import json
import time
from datetime import UTC, datetime

from app.schemas import Project, TestPlan
from app.services.analyzer import analyze_requirements
from app.services.llm import LLMError
from app.services.oracle_review import review_oracles
from evaluation.scoring import score_analysis, summarize


class RecordedLLM:
    def __init__(self, llm=None, replay=None):
        self.llm = llm
        self.replay = iter(replay) if replay is not None else None
        self.calls = []

    def parse(self, *, system, prompt, output_format):
        request_hash = hashlib.sha256(
            json.dumps(
                {
                    "system": system,
                    "prompt": prompt,
                    "output_schema": output_format.model_json_schema(),
                },
                sort_keys=True,
            ).encode()
        ).hexdigest()
        call = {"output_format": output_format.__name__, "request_sha256": request_hash}
        self.calls.append(call)
        started = time.monotonic()
        try:
            if self.replay is not None:
                item = next(self.replay, None)
                if item is None or (
                    item["output_format"] != output_format.__name__
                    or item["request_sha256"] != request_hash
                ):
                    raise LLMError("Replay response is missing or its request fingerprint differs.")
                if item.get("error"):
                    raise LLMError(item["error"])
                result = output_format.model_validate(item["response"])
            else:
                result = self.llm.parse(system=system, prompt=prompt, output_format=output_format)
            call["response"] = result.model_dump(mode="json")
            return result
        except (LLMError, ValueError) as error:
            call["error"] = str(error)
            raise LLMError(str(error)) from error
        finally:
            call["elapsed_seconds"] = round(time.monotonic() - started, 3)


def run_case(case, stage, repeat, *, llm=None, replay=None):
    recorder = RecordedLLM(llm, replay)
    project = Project(
        id=case.id,
        name="Evaluation project",
        description="",
        repository_ref="",
        requirements_text=case.specification,
        goal="Evaluate the stated requirements.",
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    result = {
        "case_id": case.id,
        "category": case.category,
        "stage": stage,
        "repeat": repeat,
        "error": None,
        "calls": recorder.calls,
    }
    if stage == "analysis":
        result.update(gold_rules=len(case.rules), score=None)
        try:
            analysis = analyze_requirements(recorder, project, max_requirements=40)
            result["score"] = score_analysis(case, analysis.requirements)
            result["stage_output"] = {
                "requirements": [item.model_dump() for item in analysis.requirements],
                "source_audit": analysis.source_audit.model_dump(),
            }
        except LLMError as error:
            result["error"] = str(error)
    else:
        result.update(
            expected_verdict=case.expected_verdict, predicted_verdict=None, eligible=False
        )
        reviewed = review_oracles(
            recorder,
            project,
            case.requirements,
            TestPlan(scenarios=[case.scenario], notes=""),
            case.repository,
        )
        grounding = reviewed.scenarios[0].oracle_grounding
        result["predicted_verdict"] = grounding.verdict
        result["eligible"] = grounding.status == "supported"
        result["stage_output"] = grounding.model_dump()
        result["error"] = next((call["error"] for call in recorder.calls if "error" in call), None)
        if result["predicted_verdict"] is None and result["error"] is None:
            result["error"] = "No unique oracle decision was returned."
    return result


def failed(record):
    if record["error"]:
        return True
    if record["stage"] == "oracle":
        return record["predicted_verdict"] != record["expected_verdict"] or record["eligible"] != (
            record["expected_verdict"] == "supported"
        )
    score = record["score"]
    return (
        score["correctly_classified_rules"] != score["gold_rules"]
        or score["duplicate_rules"]
        or score["merged_requirement_ids"]
        or score["unexpected_requirement_ids"]
    )


def make_report(
    records,
    *,
    corpus_sha256,
    mode,
    model,
    expected_samples=None,
    complete=True,
    response_origin=None,
):
    return {
        "version": 1,
        "created_at": datetime.now(UTC).isoformat(),
        "mode": mode,
        "response_origin": response_origin or mode,
        "model": model,
        "corpus_sha256": corpus_sha256,
        "expected_samples": expected_samples if expected_samples is not None else len(records),
        "complete": complete,
        "summary": summarize(records),
        "records": records,
        "failed_samples": sum(bool(failed(record)) for record in records),
        "limitations": [
            "Curated cases are not evidence of general project correctness.",
            "Analysis scores use source-aligned rule labels, not semantic paraphrase grading.",
            "Merged quotes covering several gold rules receive no individual rule credit.",
            "Oracle cases use fixed requirements/contracts; planning is not scored.",
            "Model errors are reported separately and are not counted as successful rejections.",
            "No generated code executes. Mutation adequacy and product defects are not measured.",
            "Replay measures stored responses under current gates, not fresh model quality.",
            "Token usage and monetary cost are not measured by this client.",
        ],
    }


def markdown_report(report):
    summary = report["summary"]
    lines = [
        "# ReqTest evaluation",
        "",
        f"Mode: {report['mode']}",
        f"Configured model: {report['model'] or 'No live model'}",
        f"Response origin: {report['response_origin']}",
        f"Corpus SHA-256: `{report['corpus_sha256']}`",
        "",
        f"Complete: {report['complete']}; planned samples: {report['expected_samples']}",
        "",
        f"Samples: {summary['samples']}; failures: {report['failed_samples']}; "
        f"model/protocol errors: {summary['errors']}",
        "",
        "## Metrics",
        "",
        "```json",
        json.dumps(summary, indent=2),
        "```",
        "",
        "## Samples",
        "",
        "| Case | Stage | Repeat | Result | Detail |",
        "| --- | --- | --- | --- | --- |",
    ]
    for record in report["records"]:
        detail = record["error"] or (
            f"Expected {record['expected_verdict']}; observed {record['predicted_verdict']}; "
            f"eligible={record['eligible']}"
            if record["stage"] == "oracle"
            else json.dumps(record["score"])
        )
        detail = detail.replace("|", "\\|").replace("\n", " ")
        lines.append(
            f"| {record['case_id']} | {record['stage']} | {record['repeat']} | "
            f"{'FAIL' if failed(record) else 'PASS'} | {detail} |"
        )
    lines.extend(["", "## Limits", "", *[f"- {item}" for item in report["limitations"]], ""])
    return "\n".join(lines)
