import { urlFor } from "../lib/navigation";
import type { VerificationRun } from "../lib/types";
import { Badge } from "./ui";

const short = (commit?: string | null) =>
  commit ? <code>{commit.slice(0, 12)}</code> : "an unknown commit";

export function RepositoryChangeSummary({ run }: { run?: VerificationRun }) {
  const change = run?.report.change;
  if (!run || !change) return null;
  const groups: [string, string[], string?][] = [
    ["Added", change.added],
    ["Changed", change.changed],
    ["Removed", change.removed],
    ["New tests", change.new_test_ids],
    [
      "New code without a requirement",
      change.untraced,
      "No test is generated without a requirement that states the expected behavior. Describe these functions in the requirements to cover them.",
    ],
    ["Carried tests that no longer validate", change.invalidated_tests],
    ["Regressions", change.regressions],
  ];
  return (
    <section className="panel">
      <h3>Changes since the baseline run</h3>
      <p>
        {run.trigger === "watch" && <Badge>Repository watch</Badge>} Compared
        with{" "}
        <a href={urlFor("workspace", run.project_id, change.baseline_run_id)}>
          the baseline run
        </a>{" "}
        at {short(change.baseline_commit)}; this run read {short(change.commit)}
        .{" "}
        {change.content_changed
          ? "File contents changed."
          : "File contents are identical."}{" "}
        {change.new_scenario_ids.length} scenarios and{" "}
        {change.new_test_ids.length} tests were added;{" "}
        {change.carried_test_ids.length} carried tests were re-validated and
        re-run.
      </p>
      {groups
        .filter(([, items]) => items.length)
        .map(([title, items, help]) => (
          <details key={title} open={title === "Regressions"}>
            <summary>
              {title} ({items.length})
            </summary>
            {help && <p className="small muted">{help}</p>}
            <ul>
              {items.map((item) => (
                <li key={item}>
                  <code>{item}</code>
                </li>
              ))}
            </ul>
          </details>
        ))}
    </section>
  );
}
