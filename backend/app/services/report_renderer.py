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
<div class="card"><strong>{_percent(report.requirement_coverage)}</strong><br>Requirement coverage</div>
<div class="card"><strong>{_percent(report.execution_success_rate)}</strong><br>Execution success</div></div>
<h2>Requirement-to-test mapping</h2><table><thead><tr><th>Requirement</th><th>Testable</th><th>Tests</th><th>Outcome</th></tr></thead><tbody>{''.join(mappings) or '<tr><td colspan="4">No structured requirements.</td></tr>'}</tbody></table>
<h2>Coverage gaps</h2><ul>{gaps or '<li>None recorded.</li>'}</ul>
<h2>Unresolved issues</h2><ul>{issues or '<li>None recorded.</li>'}</ul>
<h2>Failure diagnosis</h2><p>Refinement iterations: {report.refinement_iterations}</p>
<ul>{diagnoses or '<li>No failing or invalid test required diagnosis.</li>'}</ul>
<h2>Execution evidence</h2><table><thead><tr><th>Test</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>{executions or '<tr><td colspan="3">No tests executed.</td></tr>'}</tbody></table>
<h2>Input fingerprint</h2><code>{escape(run.input_sha256)}</code>
</body></html>"""


def _percent(value: float | None) -> str:
    return "Not evaluated" if value is None else f"{value * 100:.0f}%"
