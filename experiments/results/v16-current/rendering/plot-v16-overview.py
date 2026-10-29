"""Descriptive figures only; repeated/adaptive cases are not independent accuracy samples."""
import json
from pathlib import Path
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'experiments/results/v16-current')
data = json.loads((root / 'summary.json').read_text())
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 10, 'axes.spines.top': False, 'axes.spines.right': False, 'svg.fonttype': 'none'})
fig, axes = plt.subplots(2, 2, figsize=(14, 9), layout='constrained')
preflight = json.loads((root / 'preflight-summary.json').read_text())
ax = axes[0, 0]
ax.axis('off')
ax.set_title('A. Exact full-suite execution after compatibility fixes', loc='left', weight='bold')
table = ax.table(cellText=[[r['project'].title(), f"{r['retainedBaselineNodes']:,}", f"{r['baseline']['counts']['passed']:,}", r['baseline']['counts']['skipped'], 'Yes' if r['baseline']['exactCompleteCatalog'] else 'No'] for r in preflight],
                 colLabels=['Project', 'Collected', 'Passed', 'Skipped', 'Exact match'], cellLoc='center', bbox=[0, .27, 1, .58])
table.auto_set_font_size(False)
table.set_fontsize(10)
for (row, col), cell in table.get_celld().items():
    cell.set_edgecolor('#cbd5e1')
    if row == 0:
        cell.set_facecolor('#e2e8f0')
        cell.set_text_props(weight='bold')
ax.text(0, .13, 'Execution uses the full imported suite. The model receives\na separate bounded node catalog; binary fixtures remain intact.', transform=ax.transAxes, fontsize=9, color='#475569')

ax = axes[0, 1]
study = next(s for s in data['studies'] if s['study'] == 'full-projects')
for i, item in enumerate(study['summary']):
    ax.barh(i, item['generatedPassed'], color='#22c55e', label='Passed' if i == 0 else None)
    ax.barh(i, item['generatedFailed'], left=item['generatedPassed'], color='#ef4444', label='Failed' if i == 0 else None)
    ax.text(55, i, f"{item['generatedPassed']}/54 passed", va='center')
ax.set_yticks([0, 1], ['B1', 'B3 final'])
ax.invert_yaxis()
ax.set_xlim(0, 72)
ax.set_xlabel('Generated cases; 3 projects x 3 repeats x 6 requirements')
ax.set_title('B. Unmodified projects: 18/18 workflows complete', loc='left', weight='bold')
ax.legend(loc='lower right', frameon=False)

ax = axes[1, 0]
names = ['C01: value-only', 'C04: concrete int', 'C05: semantic int', 'C05: log references']
folders = ['diagnosis-ablation', 'typed-valid-failure', 'semantic-valid-failure', 'execution-reference-regression']
exposed, matches = [], []
for folder in folders:
    rows = json.loads((root / folder / 'diagnosis-exposure.json').read_text())['rows']
    subset = [r for r in rows if r['variant'] == 'B3' and (folder != 'diagnosis-ablation' or r['caseId'].startswith('C01'))]
    exposed.append(sum(r['runtimeFailureExposed'] is True for r in subset))
    matches.append(sum(r['agreesWithFixtureReference'] is True for r in subset))
ax.barh(names, exposed, color='#60a5fa')
ax.invert_yaxis()
for i, number in enumerate(exposed):
    ax.text(number + .08, i, f'{number}/3 exposed' if number else '0/3: blocked before execution', va='center', fontsize=9)
ax.set_xlim(0, 5.8)
ax.set_xticks([0, 1, 2, 3])
ax.set_xlabel('Runtime failure exposure in common preparations')
ax.set_title('C. Admission blocks receive no diagnosis credit', loc='left', weight='bold')

ax = axes[1, 1]
ax.bar(['Copied trace text', 'Exact E-reference'], matches[-2:], color=['#f59e0b', '#3b82f6'])
for i, number in enumerate(matches[-2:]):
    ax.text(i, number + .08, f'{number}/3', ha='center', weight='bold')
ax.set_ylim(0, 3.8)
ax.set_yticks([0, 1, 2, 3])
ax.set_ylabel('Grounded model category matching controlled fixture')
ax.set_title('D. Targeted execution-citation regression', loc='left', weight='bold')
ax.text(.5, .93, 'Both B2 and B3 preserve the valid failure in 3/3.\nNo general superiority or independent accuracy claim.', transform=ax.transAxes, ha='center', va='top', fontsize=9)
fig.suptitle('v16 engineering validation and recorded outcomes', fontsize=17, weight='bold')
fig.supxlabel('C01/C04/C05 reuse one Click fault; revisions are adaptive and are not independent projects.\nB1/B3 changes multiple stages. D is a separate source revision and one-case engineering regression, not a blind comparison.', fontsize=9)
folder = root / 'figures'
folder.mkdir(exist_ok=True)
for ext in ['png', 'svg']:
    fig.savefig(folder / f'overview.{ext}', dpi=180, bbox_inches='tight')
plt.close(fig)
