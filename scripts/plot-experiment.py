"""Render standalone experiment figures from recorded measurements only."""
import json
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
labels = [item["variant"] for item in summary]
colors = ["#94a3b8", "#93c5fd", "#3b82f6", "#1d4ed8"][:len(labels)]
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11, "axes.spines.top": False,
                     "axes.spines.right": False, "axes.titleweight": "bold", "figure.facecolor": "white",
                     "axes.labelcolor": "#334155", "text.color": "#0f172a", "svg.fonttype": "none"})
figures = root / "figures"
figures.mkdir(exist_ok=True)


def save(fig, name, caption):
    fig.text(.02, .015, textwrap.fill(caption, 135), fontsize=8, color="#475569")
    fig.tight_layout(rect=(0, .13, 1, .95), pad=1.4)
    fig.savefig(figures / (name + ".png"), dpi=200, facecolor="white")
    fig.savefig(figures / (name + ".svg"), facecolor="white")
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
save(fig, "03-latency-and-tokens", "Dots are recorded runs, grouped across three development projects. Whiskers show min/max; no population inference. Failed calls with unknown tokens are omitted and counted in n.")

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
print(f"Saved PNG and SVG figures to {figures}")
