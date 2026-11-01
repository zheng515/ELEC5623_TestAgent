"""Render descriptive resource plots from saved v22 metrics; no provider calls."""
import argparse
import json
import math
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('studies', nargs='*', default=[
    'experiments/results/v22-real-project-matrix',
    'experiments/results/v22-fault-cases',
])
args = parser.parse_args()
plt.rcParams['svg.hashsalt'] = 'reqtest-v22'

for directory in args.studies:
    study = Path(directory)
    metrics = json.loads((study / 'metrics.json').read_text())
    details = json.loads((study / 'workflow-details.json').read_text())
    summary = metrics['summary']
    output = study / 'figures'
    output.mkdir(exist_ok=True)
    figure, axes = plt.subplots(1, 3, figsize=(12, 3.6), layout='constrained')
    colors = ['#7d91b4', '#5276ae', '#2b5899', '#133b72']
    for axis, key, title in zip(axes,
            ['modelRequests', 'totalTokens', 'medianSeconds'],
            ['Actual model requests', 'Reported tokens (known subtotal)', 'Median agent seconds']):
        values = []
        for row in summary:
            observed = [item for item in details['rows'] if item['variant'] == row['variant']]
            value = sum(item['knownTokens'] for item in observed) if key == 'totalTokens' and observed else row[key]
            values.append(value if value is not None else math.nan)
        axis.bar([row['variant'] for row in summary], values, color=colors)
        axis.set_title(title, fontsize=10)
        axis.spines[['top', 'right']].set_visible(False)
        axis.ticklabel_format(axis='y', style='plain')
        for index, value in enumerate(values):
            if math.isfinite(value):
                axis.text(index, value, f'{value:,.0f}', ha='center', va='bottom', fontsize=8)
            else:
                axis.text(index, 0, 'Unavailable', ha='center', va='bottom', fontsize=7, rotation=90)
        finite = [value for value in values if math.isfinite(value)]
        if finite and max(finite) > 0:
            axis.set_ylim(0, max(finite) * 1.18)
    protocol = metrics['protocol']
    repeat_label = 'repeat' if protocol['repeat'] == 1 else 'repeats'
    scope = f"{len(protocol['cases'])} declared cases, {protocol['repeat']} {repeat_label}"
    figure.suptitle(scope + ' - descriptive resources', fontsize=11)
    figure.savefig(output / 'resources.png', dpi=180)
    figure.savefig(output / 'resources.svg', metadata={'Date': None})
    svg = output / 'resources.svg'
    svg.write_text('\n'.join(line.rstrip() for line in svg.read_text().splitlines()) + '\n')
    plt.close(figure)
    print(f'Rendered saved measurements: {study}')
