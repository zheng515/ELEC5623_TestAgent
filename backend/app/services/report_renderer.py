# ruff: noqa: E501

from html import escape

from app.schemas import Project, VerificationRun


def render_html_report(project: Project, run: VerificationRun) -> str:
    """Render a portable, escaped verification report (FR15)."""
    report = run.report
    mappings = []
    for requirement in report.requirements:
        tests = [test for test in report.generated_tests if requirement.id in test.requirement_ids]
        outcomes = [
            execution.outcome
            for execution in report.executions
            if any(test.id == execution.test_id for test in tests)
        ]
        mappings.append(
            "<tr>"
            f"<td><strong>{escape(requirement.id)}</strong><br>{escape(requirement.text)}</td>"
            f"<td>{'Yes' if requirement.testable else 'No'}</td>"
            f"<td>{escape(', '.join(test.module for test in tests) or 'None')}</td>"
            f"<td>{escape(', '.join(outcomes) or 'Not executed')}</td>"
            "</tr>"
        )

    issues = "".join(f"<li>{escape(issue)}</li>" for issue in report.unresolved_issues)
    gaps = "".join(f"<li>{escape(gap)}</li>" for gap in report.coverage_gaps)
    executions = "".join(
        "<tr>"
        f"<td>{escape(item.module)}::{escape(item.name)}</td>"
        f"<td>{escape(item.outcome)}</td>"
        f"<td>{escape(item.message or 'None')}</td>"
        "</tr>"
        for item in report.executions
    )
    diagnoses = "".join(
        f"<li><strong>{escape(item.test_id or 'Unmatched test')}</strong>: "
        f"{escape(item.classification)} - {escape(item.explanation)}</li>"
        for item in report.diagnoses
    )
    plan_html = _render_plan(run)
    attempt_html = _render_attempts(run)
    audit = report.source_audit
    source_html = "<p>No source audit recorded. Specification completeness is unknown.</p>"
    if audit:
        source_html = (
            f"<p>{audit.retained_requirements} requirements retained. "
            f"Extraction limit: {audit.extraction_limit}. "
            f"Limit reached: {'Yes' if audit.limit_reached else 'No'}.</p>"
            + _items(audit.issues)
            + "<h3>Source fragments without unambiguous quote links</h3>"
            + (
                "".join(
                    f"<details><summary>Line {fragment.line}</summary>"
                    f"<pre>{escape(fragment.text)}</pre></details>"
                    for fragment in audit.unlinked_fragments
                )
                or "<p>None recorded. This does not establish semantic completeness.</p>"
            )
            + "<h3>Recorded source quote links</h3>"
            + "".join(
                f"<details><summary>{escape(', '.join(link.requirement_ids))}: line {link.line}</summary>"
                f"<pre>{escape(link.text)}</pre></details>"
                for link in audit.links
            )
        )
    validation_html = "".join(
        f"<details><summary>{escape(test.id)}: {escape(test.module)} — "
        f"{escape(test.validation_status)}</summary>"
        f"<p>Claimed scenarios: {escape(', '.join(test.scenario_ids))}</p>"
        + _items(test.validation_issues)
        + _items(
            [
                f"{check.scenario_id}: {check.function_name} → {check.target}; "
                f"call line {check.call_line}, assertion line {check.assertion_line}"
                for check in test.validated_checks
            ]
        )
        + f"<pre>{escape(test.code)}</pre></details>"
        for test in report.generated_tests
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>ReqTest report - {escape(project.name)}</title>
<style>
body{{font:15px/1.55 system-ui,sans-serif;color:#17352d;max-width:1100px;margin:40px auto;padding:0 24px}}
h1{{font-size:34px}} h2{{margin-top:34px;border-bottom:1px solid #d8e2d2;padding-bottom:8px}}
.meta,.metrics{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}}
.card{{background:#f4f7ef;border:1px solid #d8e2d2;border-radius:8px;padding:14px}}
table{{width:100%;border-collapse:collapse}} th,td{{text-align:left;vertical-align:top;border:1px solid #d8e2d2;padding:10px}}
th{{background:#edf3e7}} code{{overflow-wrap:anywhere}} .muted{{color:#61756d}} @media print{{body{{margin:0}}}}
pre{{white-space:pre-wrap;overflow-wrap:anywhere}}
</style></head><body>
<p class="muted">REQTEST / VERIFICATION REPORT</p><h1>{escape(project.name)}</h1>
<p>{escape(report.summary)}</p>
<div class="meta"><div class="card"><strong>Run</strong><br><code>{escape(run.id)}</code></div>
<div class="card"><strong>Status</strong><br>{escape(run.status)}</div>
<div class="card"><strong>Mode</strong><br>{escape(run.mode)}</div>
<div class="card"><strong>Created</strong><br>{escape(run.created_at.isoformat())}</div></div>
<h2>Goal</h2><p>{escape(project.goal)}</p>
<h2>Results</h2><div class="metrics">
<div class="card"><strong>{len(report.requirements)}</strong><br>Requirements</div>
<div class="card"><strong>{len(report.generated_tests)}</strong><br>Generated tests</div>
<div class="card"><strong>{report.executed_tests}</strong><br>Executed tests</div>
<div class="card"><strong>{_percent(report.requirement_coverage)}</strong><br>Extracted requirement links</div>
<div class="card"><strong>{_percent(report.execution_success_rate)}</strong><br>Execution success</div></div>
<h2>Requirement-to-test mapping</h2><table><thead><tr><th>Requirement</th><th>Testable</th><th>Tests</th><th>Outcome</th></tr></thead><tbody>{"".join(mappings) or '<tr><td colspan="4">No structured requirements.</td></tr>'}</tbody></table>
<h2>Specification analysis scope</h2>{source_html}
<h2>Test plan</h2>{plan_html}
<h2>Code-to-plan validation</h2>
<p>Only validated links count in new-run coverage. Matching a plan does not prove
that its expectations are correct or complete. Legacy artifacts have no validation record.</p>
{validation_html or "<p>No generated artifacts.</p>"}
<h2>Execution history</h2>{attempt_html}
<h2>Coverage gaps</h2><ul>{gaps or "<li>None recorded.</li>"}</ul>
<h2>Unresolved issues</h2><ul>{issues or "<li>None recorded.</li>"}</ul>
<h2>Failure diagnosis</h2><p>Refinement iterations: {report.refinement_iterations}</p>
<ul>{diagnoses or "<li>No failing or invalid test required diagnosis.</li>"}</ul>
<h2>Execution evidence</h2><table><thead><tr><th>Test</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>{executions or '<tr><td colspan="3">No tests executed.</td></tr>'}</tbody></table>
<h2>Input fingerprint</h2><code>{escape(run.input_sha256)}</code>
</body></html>"""


def _render_attempts(run: VerificationRun) -> str:
    sections = []
    for attempt in run.report.execution_attempts:
        rows = "".join(
            f"<li>{escape(item.test_id or 'Unmatched')}: {escape(item.name)} — {escape(item.outcome)}"
            f"<pre>{escape(item.message)}</pre></li>"
            for item in attempt.result.executions
        )
        artifacts = "".join(
            f"<details><summary>Artifact {escape(test.id)}: {escape(test.module)}</summary>"
            f"<pre>{escape(test.code)}</pre></details>"
            for test in attempt.tests
        )
        diagnoses = _items(
            [
                f"{item.test_id or 'Unmatched'}: {item.classification} — {item.explanation}"
                for item in attempt.diagnoses
            ]
        )
        sections.append(
            f'<section class="card"><h3>Attempt {attempt.number}: {escape(attempt.stage)}</h3>'
            f"<p>Exit code: {attempt.result.exit_code} | Timed out: {attempt.result.timed_out}</p>"
            f"<pre>{escape(attempt.result.stderr_excerpt)}</pre>"
            f"<ul>{rows or '<li>No outcomes recorded.</li>'}</ul>{diagnoses}{artifacts}</section>"
        )
    if not sections:
        sections.append("<p>No archived sandbox attempts were recorded.</p>")
    if run.report.execution_gaps:
        sections.append(
            "<h3>Tests without final execution outcomes</h3>" + _items(run.report.execution_gaps)
        )
    return "".join(sections)


def _percent(value: float | None) -> str:
    return "Not evaluated" if value is None else f"{value * 100:.0f}%"


def _items(values: list[str]) -> str:
    return (
        "<ul>" + "".join(f"<li>{escape(value)}</li>" for value in values) + "</ul>"
        if values
        else "<p>None specified.</p>"
    )


def _render_plan(run: VerificationRun) -> str:
    report = run.report
    plan = report.test_plan
    if plan is None:
        return "<p>No test plan recorded for this run.</p>"
    sections = ["<p>Planned checks are distinct from generated tests and execution evidence.</p>"]
    if not plan.scenarios:
        sections.append("<p>No executable scenarios were planned.</p>")
    for scenario in plan.scenarios:
        tests = [test for test in report.generated_tests if scenario.id in test.scenario_ids]
        sources = []
        for ref in scenario.evidence_refs:
            requirement = next(
                (item for item in report.requirements if ref == f"requirement:{item.id}"), None
            )
            module = (
                next(
                    (
                        item
                        for item in report.repository.modules
                        if ref == f"repository:{item.path}"
                    ),
                    None,
                )
                if report.repository
                else None
            )
            detail = (
                requirement.source_quote
                if requirement
                else "; ".join([*module.functions, *module.classes])
                if module
                else ""
            )
            sources.append(ref + (f": {detail}" if detail else ""))
        outcomes = [
            f"{item.name}: {item.outcome}"
            for item in report.executions
            if any(
                test.id == item.test_id
                and (
                    any(
                        check.scenario_id == scenario.id and check.function_name == item.name
                        for check in test.validated_checks
                    )
                    if test.validation_status == "validated"
                    else test.validation_status == "not_checked"
                )
                for test in tests
            )
        ]
        contract = (
            escape(scenario.check.model_dump_json(indent=2))
            if scenario.check
            else "No structured contract recorded."
        )
        sections.append(
            f'<section class="card"><h3>{escape(scenario.id)}: {escape(scenario.title)}</h3>'
            f"<p>{escape(scenario.category)} | Requirements: {escape(', '.join(scenario.requirement_ids))}</p>"
            f"<h4>Preconditions</h4>{_items(scenario.preconditions)}"
            f"<h4>Inputs</h4>{_items(scenario.inputs)}"
            f"<h4>Steps</h4>{_items(scenario.steps)}"
            f"<h4>Expected result</h4><p>{escape(scenario.expected_result)}</p>"
            f"<h4>Structured check contract</h4><pre>{contract}</pre>"
            f"<h4>Assumptions</h4>{_items(scenario.assumptions)}"
            f"<h4>Source evidence</h4>{_items(sources)}"
            f"<h4>Generated tests</h4>{_items([f'{test.id} ({test.module})' for test in tests])}"
            f"<h4>Execution outcomes</h4>{_items(outcomes) if outcomes else '<p>Not executed.</p>'}</section>"
        )
    if plan.notes:
        sections.append(f"<h3>Planning notes</h3><p>{escape(plan.notes)}</p>")
    if report.planning_gaps:
        sections.append(f"<h3>Requirements without scenarios</h3>{_items(report.planning_gaps)}")
    if report.uncovered_scenarios:
        sections.append(
            f"<h3>Scenarios without validated implementations</h3>{_items(report.uncovered_scenarios)}"
        )
    return "".join(sections)
