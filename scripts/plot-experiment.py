"""Render standalone experiment figures from recorded measurements only."""
import json
import statistics
import sys
import textwrap
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

root = Path(sys.argv[1])
data = json.loads((root / "metrics.json").read_text())
rows, summary = data["rows"], data["summary"]
paired_resources = data.get("protocol", {}).get("sharedInitialSuite", False)
if paired_resources:
    # Continuation rows omit B1 and any common preparation from raw costs.
    pairs = json.loads((root / "paired-comparison.json").read_text())["rows"]
    rows = [dict(row) for row in rows]
    for row in rows:
        if row["variant"] not in ("B2", "B3"):
            continue
        matches = [pair for pair in pairs if pair["caseId"] == row["caseId"] and pair["repeat"] == row["repeat"]
                   and pair.get("variant", "B3") == row["variant"]]
        if not matches and row['status'] in ['missing', 'failed', 'cancelled']:
            # A stopped study can end before a shared prefix exists. Its paired
            # end-to-end resources are unavailable; retain raw requests elsewhere.
            row.update(elapsedSeconds=None, totalTokens=None, modelRequests=None)
            continue
        if len(matches) != 1:
            raise ValueError("Every continuation resource row requires exactly one matching variant/case/repeat pair")
        pair = matches[0]
        row.update(elapsedSeconds=pair["endToEndSeconds"], totalTokens=pair["endToEndTokens"],
                   modelRequests=pair["endToEndRequests"])
resource_scope = ("Continuation resources include B1, any common preparation and follow-up per strategy; shared work is counted once in actual bills. " if paired_resources else "")
labels = [item["variant"] for item in summary]
colors = ["#94a3b8", "#93c5fd", "#3b82f6", "#1d4ed8"][:len(labels)]
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.spines.top": False,
                     "axes.spines.right": False, "axes.titleweight": "bold", "figure.facecolor": "white",
                     "axes.labelcolor": "#334155", "text.color": "#0f172a", "svg.fonttype": "none"})
figures = root / "figures"
figures.mkdir(exist_ok=True)


def save(fig, name, caption):
    fig.text(.02, .015, textwrap.fill(caption, max(60, int(fig.get_figwidth() * 12))), fontsize=8, color="#475569")
    fig.tight_layout(rect=(0, .13, 1, .95), pad=1.4)
    fig.savefig(figures / (name + ".png"), dpi=200, facecolor="white", bbox_inches="tight")
    fig.savefig(figures / (name + ".svg"), facecolor="white", bbox_inches="tight")
    svg_path = figures / (name + ".svg")
    svg_path.write_text("\n".join(line.rstrip() for line in svg_path.read_text().splitlines()) + "\n")
    plt.close(fig)


x = np.arange(len(labels))
fig, ax = plt.subplots(figsize=(9, 5))
completed = [item["completed"] for item in summary]
executed = [round(item["completedWithExecutionRate"] * item["plannedRuns"]) for item in summary]
for offset, values, color, label in [(-.18, completed, "#93c5fd", "Workflow completed"), (.18, executed, "#1d4ed8", "Completed with passing/failing execution")]:
    bars = ax.bar(x + offset, values, width=.34, color=color, label=label)
    ax.bar_label(bars, labels=[f"{value}/{item['plannedRuns']}" for value, item in zip(values, summary)], padding=4)
ax.set(xticks=x, xticklabels=labels, ylabel="Number of runs", title="Workflow completion and usable execution",
       ylim=(0, max(item["plannedRuns"] for item in summary) * 1.25))
ax.yaxis.get_major_locator().set_params(integer=True)
ax.legend(loc="upper center", bbox_to_anchor=(.5, -.06), frameon=False, fontsize=9)
save(fig, "01-completion", "All planned runs are counted. Successful workflow termination does not establish semantic correctness.")

fig, ax = plt.subplots(figsize=(9, 5))
for offset, key, color, label in [(-.18, "faultBefore", "#93c5fd", "Initial generated suite"), (.18, "faultAfter", "#1d4ed8", "Final suite")]:
    for i, variant in enumerate(labels):
        subset = [row for row in rows if row["variant"] == variant and row["faultCase"]]
        observed = [row for row in subset if row[key] is not None]
        count = sum(row[key] is True for row in observed)
        ax.bar(i + offset, count, width=.34, color=color, label=label if i == 0 else None)
        ax.text(i + offset, count + .15, f"{count}/{len(subset)}" + (f"\n{len(subset)-len(observed)} pending" if len(observed) < len(subset) else ""), ha="center", fontsize=9)
ax.set(xticks=x, xticklabels=labels, ylabel="Detected seeded-fault runs", title="Fault detection on original and corrected copies",
       ylim=(0, max(item["faultRuns"] for item in summary) * 1.3 + .5))
ax.yaxis.get_major_locator().set_params(integer=True)
ax.legend(frameon=False, loc="upper left")
save(fig, "02-fault-detection", "Fixed external contract witnesses validate the correction patches. Pending probes receive no detection credit; semantic accuracy is unreviewed.")

fig, axes = plt.subplots(1, 2, figsize=(11, 5))
for i, variant in enumerate(labels):
    subset = [row for row in rows if row["variant"] == variant]
    for ax, key, scale in [(axes[0], "elapsedSeconds", 1), (axes[1], "totalTokens", 1000)]:
        values = [row[key] / scale for row in subset if row[key] is not None]
        if values:
            ax.boxplot([values], positions=[i], widths=.5, patch_artist=True, showfliers=False,
                       boxprops={"facecolor": colors[i], "alpha": .7}, medianprops={"color": "#0f172a"}, whis=(0, 100))
            offsets = np.linspace(-.14, .14, len(values)) if len(values) > 1 else [0]
            ax.scatter(i + np.array(offsets), values, color="#0f172a", s=18, zorder=3, alpha=.6)
        ax.set_xticks(x, [label + "\n" + f"n={sum(row[key] is not None for row in rows if row['variant'] == label)}/{sum(row['variant'] == label for row in rows)}" for label in labels])
for ax, title, ylabel in [(axes[0], "End-to-end latency", "Seconds per run"), (axes[1], "Provider-reported token usage", "Thousands of tokens per run")]:
    ax.set(title=title, ylabel=ylabel, xlim=(-.6, len(labels)-.4))
    ax.set_ylim(bottom=0)
    ax.grid(axis="y", alpha=.15)
save(fig, "03-latency-and-tokens", resource_scope + "Dots are recorded runs, grouped across the frozen case set. Whiskers show min/max; no population inference. Failed calls with unknown tokens are omitted and counted in n.")

paired = [row for row in rows if row["mutationTotal"] is not None]
fig, ax = plt.subplots(figsize=(10, max(4, len(paired) * .45 + 1.8)))
if paired:
    for i, row in enumerate(paired):
        before, after = row["mutationBeforeKilled"], row["mutationAfterKilled"]
        ax.plot([before, after], [i, i], color="#93c5fd", linewidth=4)
        ax.scatter(before, i, color="#94a3b8", s=65, label="Before" if i == 0 else None, zorder=3)
        ax.scatter(after, i, color="#1d4ed8", s=65, label="After" if i == 0 else None, zorder=4)
        ax.annotate(f"{before} → {after} / {row['mutationTotal']}", (max(before, after), i), xytext=(10, 0), textcoords="offset points", va="center", fontsize=9)
    ax.set(yticks=range(len(paired)), yticklabels=[f"{row['caseId']} / {row['variant']} / repeat {row['repeat']}" for row in paired], xlabel="Raw killed mutants")
    ax.set_xlim(0, max(row["mutationTotal"] for row in paired) * 1.4)
    ax.legend(frameon=False)
else:
    raw = [row for row in rows if row["rawMutationComplete"] and row["rawMutationTotal"]]
    if raw:
        for i, row in enumerate(raw):
            ax.barh(i, row["rawMutationTotal"], color="#dbeafe")
            ax.barh(i, row["rawMutationKilled"], color="#1d4ed8")
            ax.text(row["rawMutationTotal"] + .3, i, f"{row['rawMutationKilled']}/{row['rawMutationTotal']}", va="center", fontsize=9)
        ax.set(yticks=range(len(raw)), yticklabels=[f"{row['caseId']} / {row['variant']} / repeat {row['repeat']}" for row in raw], xlabel="Latest raw killed / total mutants")
        ax.set_xlim(0, max(row["rawMutationTotal"] for row in raw) * 1.2)
    else:
        ax.text(.5, .5, "No complete, comparable mutation measurements\nUnavailable outcomes are not scored.", transform=ax.transAxes, ha="center", va="center")
        ax.set_axis_off()
ax.set_title("Paired mutation feedback" if paired else "Mutation observations: no paired improvement evidence")
save(fig, "04-mutation-feedback", "Raw tool counts only. Relevance and equivalence have not been independently reviewed; no semantic mutation score is claimed.")

fig, ax = plt.subplots(figsize=(9, 5))
bottom = np.zeros(len(labels))
for key, color, label in [("generatedPassed", "#2563eb", "Passed"), ("generatedFailed", "#fb923c", "Failed assertions"), ("generatedErrors", "#64748b", "Execution errors")]:
    values = [sum(row[key] for row in rows if row["variant"] == variant) for variant in labels]
    bars = ax.bar(x, values, bottom=bottom, color=color, label=label, width=.55)
    ax.bar_label(bars, labels=[str(value) if value else "" for value in values], label_type="center", color="white")
    bottom += values
ax.set(xticks=x, xticklabels=labels, ylabel="Executed generated checks", title="Actual generated-test outcomes across all runs", ylim=(0, max(1, max(bottom)) * 1.15))
ax.yaxis.get_major_locator().set_params(integer=True)
ax.legend(frameon=False, loc="upper left", bbox_to_anchor=(1,1))
save(fig, "05-test-outcomes", "Passing counts are observed test cases, not accuracy or equal coverage. A failing assertion can successfully expose a seeded defect. Blocked proposals are not executed tests; inspect variants.csv separately.")

cases = list(dict.fromkeys(row["caseId"] for row in rows))
fig, ax = plt.subplots(figsize=(max(7, len(labels) * 1.9), max(4, len(cases) * .9 + 1.7)))
ax.set(xlim=(-.5, len(labels)-.5), ylim=(len(cases)-.5, -.5),
       xticks=range(len(labels)), xticklabels=labels, yticks=range(len(cases)), yticklabels=cases,
       title="Per-case seeded-fault detection and execution")
for i, case in enumerate(cases):
    for j, variant in enumerate(labels):
        subset = [row for row in rows if row["caseId"] == case and row["variant"] == variant]
        faults = [row for row in subset if row["faultCase"]]
        if faults:
            detected = sum(row["faultAfter"] is True for row in faults)
            pending = sum(row["faultAfter"] is None for row in faults)
            label = f"Detected {detected}/{len(faults)}" + (f"\n{pending} unresolved" if pending else "")
            color = "#dbeafe" if detected == len(faults) else "#ffedd5"
        else:
            executed = sum(row["completedWithExecution"] for row in subset)
            label = f"Executed {executed}/{len(subset)}\nNo seeded fault"
            color = "#f1f5f9"
        ax.add_patch(plt.Rectangle((j-.47, i-.42), .94, .84, facecolor=color, edgecolor="white"))
        ax.text(j, i, label, ha="center", va="center", fontsize=10)
ax.tick_params(length=0, pad=10)
for spine in ax.spines.values(): spine.set_visible(False)
save(fig, "06-case-results", "Denominators include every planned repeat. No seeded fault does not mean no possible bug. Detection requires the original failure and a matching pass on the corrected copy; this is not overall semantic accuracy.")

if any("referenceFailureObserved" in row for row in rows):
    fig, ax = plt.subplots(figsize=(9, 5))
    bottom = np.zeros(len(labels))
    for state, color, label in [(False, "#2563eb", "No reference assertion failure"), (True, "#f59e0b", "Reference assertion failure"), (None, "#cbd5e1", "Replay unavailable")]:
        values = [sum(row.get("referenceFailureObserved") is state for row in rows if row["variant"] == variant) for variant in labels]
        bars = ax.bar(x, values, bottom=bottom, color=color, label=label, width=.55)
        ax.bar_label(bars, labels=[str(value) if value else "" for value in values], label_type="center")
        bottom += values
    ax.set(xticks=x, xticklabels=labels, ylabel="Number of runs", title="Generated tests replayed on reference copies", ylim=(0, max(bottom) * 1.15))
    ax.yaxis.get_major_locator().set_params(integer=True)
    ax.legend(frameon=False, loc="upper left", bbox_to_anchor=(1, 1))
    save(fig, "07-reference-replay", "Reference copies passed fixed external contract witnesses. Remaining assertion failures are disagreements to investigate, not independently established false positives. Empty, erroneous or skipped replays are unavailable.")

if len(labels) == 2 and len(cases) > 1:
    fig, axes = plt.subplots(1, 2, figsize=(12, max(4.8, len(cases) * .55 + 2)))
    for ax, key, title, xlabel in [
        (axes[0], "elapsedSeconds", "Per-project median latency", "Seconds per workflow (log scale)"),
        (axes[1], "totalTokens", "Per-project total token usage", "Tokens across repeats (log scale)"),
    ]:
        for i, case in enumerate(cases):
            values = []
            for variant in labels:
                subset = [row for row in rows if row["caseId"] == case and row["variant"] == variant]
                observed = [row[key] for row in subset if row[key] is not None]
                values.append((statistics.median(observed) if key == "elapsedSeconds" else sum(observed))
                              if observed and len(observed) == len(subset) else None)
            if all(value is not None and value > 0 for value in values):
                ax.plot(values, [i, i], color="#cbd5e1", linewidth=2)
                ax.annotate(f"{values[1] / values[0]:.2f}x", (max(values), i), xytext=(9, 0),
                            textcoords="offset points", va="center", fontsize=9)
            for j, value in enumerate(values):
                if value is not None and value > 0:
                    ax.scatter(value, i, color=colors[j], s=65, label=labels[j] if i == 0 else None, zorder=3)
        ax.set_xscale("log")
        ax.set(yticks=range(len(cases)), yticklabels=cases, title=title, xlabel=xlabel)
        ax.invert_yaxis()
        ax.margins(x=.35, y=.15)
        ax.grid(axis="x", alpha=.15)
        ax.legend(frameon=False)
    save(fig, "08-project-resource-tradeoffs", resource_scope + "Each project retains every repeat. Ratios compare the second configuration to the first. Unknown measurements are omitted, never treated as zero. Different workflow budgets prevent an equal-cost or isolated-component claim.")

recovery_path = root / "recovery-metrics.json"
if recovery_path.exists():
    recovery = json.loads(recovery_path.read_text())
    groups = recovery["summary"]
    challenges = list(dict.fromkeys(item["challenge"] for item in groups))
    fig, ax = plt.subplots(figsize=(10, max(4, len(challenges) * .8 + 1.7)))
    ax.set(xlim=(-.5, len(labels)-.5), ylim=(len(challenges)-.5, -.5),
           xticks=range(len(labels)), xticklabels=labels, yticks=range(len(challenges)),
           yticklabels=[item.replace("-", " ") for item in challenges], title="Controlled recovery and valid-failure retention")
    for i, challenge in enumerate(challenges):
        for j, variant in enumerate(labels):
            matches = [item for item in groups if item["variant"] == variant and item["challenge"] == challenge]
            if len(matches) != 1:
                raise ValueError("Every recovery cell requires one challenge/variant summary")
            item = matches[0]
            text = f"{item['succeeded']}/{item['planned']}" + (f"\n{item['unresolved']} unavailable" if item["unresolved"] else "")
            color = "#dcfce7" if item["succeeded"] == item["planned"] else "#ffedd5"
            ax.add_patch(plt.Rectangle((j-.47, i-.42), .94, .84, facecolor=color, edgecolor="white"))
            ax.text(j, i, text, ha="center", va="center")
    ax.tick_params(length=0, pad=10)
    for spine in ax.spines.values(): spine.set_visible(False)
    save(fig, "09-recovery-challenges", "Success means corrected-copy detection, original artifact repair, or unchanged valid-failure retention, depending on the declared challenge. Every planned repeat remains. These developer-seeded cases do not measure natural-error frequency or independent semantic accuracy.")

exposure_path = root / "diagnosis-exposure.json"
if exposure_path.exists():
    exposure = json.loads(exposure_path.read_text())["rows"]
    variants = list(dict.fromkeys(row["variant"] for row in exposure))
    cases = list(dict.fromkeys(row["caseId"] for row in exposure))
    fig, ax = plt.subplots(figsize=(9, max(4, len(cases) * .9 + 1.7)))
    ax.set(xlim=(-.5, len(variants)-.5), ylim=(len(cases)-.5, -.5),
           xticks=range(len(variants)), xticklabels=variants, yticks=range(len(cases)), yticklabels=cases,
           title="Which cases reached runtime diagnosis?")
    for i, case in enumerate(cases):
        for j, variant in enumerate(variants):
            subset = [row for row in exposure if row["caseId"] == case and row["variant"] == variant]
            exposed = sum(row["runtimeFailureExposed"] is True for row in subset)
            blocked = sum(row["originalAdmitted"] is False for row in subset)
            matches = sum(row["agreesWithFixtureReference"] is True for row in subset)
            scored = sum(row["agreesWithFixtureReference"] is not None for row in subset)
            text = f"{exposed}/{len(subset)} runtime failures\n"
            text += f"{matches}/{scored} fixture matches" if scored else f"{blocked} blocked; model agreement N/A"
            ax.add_patch(plt.Rectangle((j-.47, i-.42), .94, .84, facecolor="#dbeafe" if exposed else "#ffedd5", edgecolor="white"))
            ax.text(j, i, text, ha="center", va="center", fontsize=10)
    ax.tick_params(length=0, pad=10)
    for spine in ax.spines.values(): spine.set_visible(False)
    save(fig, "10-diagnosis-exposure", "Every planned follow-up remains. Admission rejection is not runtime diagnosis. B2 uses an unconditional baseline, not model classification. B3 matches refer to developer fixture labels, not independent accuracy. N/A also covers unavailable preparations or classifications; inspect JSON.")

print(f"Saved PNG and SVG figures to {figures}")
