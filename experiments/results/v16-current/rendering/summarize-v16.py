"""Objective v16 inventory; reads raw reports without overwriting judgments or failures."""
from collections import Counter
import json
from pathlib import Path
import sys
import zipfile

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'experiments/results/v16-current')
studies = []
resources = []
for name in ['full-projects', 'stopped-context-study', 'diagnosis-ablation', 'typed-valid-failure', 'semantic-valid-failure', 'execution-reference-regression']:
    study = root / name
    if not (study / 'metrics.json').exists():
        continue
    archive = zipfile.ZipFile(study / 'evidence.zip') if (study / 'evidence.zip').exists() else None
    def load(file):
        raw = archive.read(file) if archive else (study / 'evidence' / file).read_bytes()
        return json.loads(raw)
    index = load('index.json')
    metrics = json.loads((study / 'metrics.json').read_text())
    records = []
    counts = Counter()
    row_details = []
    for entry in index['runs']:
        report = load(entry['report'])
        counts[report['status']] += 1
        records.extend(load(entry['requests']))
        baseline = report.get('baseline')
        discovery = report.get('testDiscovery')
        row_details.append({'caseId': entry['caseId'], 'variant': entry['variant'], 'repeat': entry['repeat'], 'status': report['status'], 'error': report.get('error'),
                            'baselineCounts': dict(Counter(outcome['status'] for outcome in baseline['outcomes'])) if baseline else None,
                            'discovery': discovery | {'assets': len(discovery['assets'])} if discovery else None,
                            'savedBehaviorStates': dict(Counter(item['status'] for item in report['states'])),
                            'diagnoses': [{'testId': item['testId'], 'phase': item.get('phase', 'execution'), 'category': item['category']} for item in report.get('diagnoses', [])],
                            'improvements': len(report['improvements']),
                            'contextSelections': [{'stage': item['stage'], 'selectedBytes': item['selectedBytes'], 'totalBytes': item['totalBytes'], 'omittedFiles': len(item['omitted'])} for item in report.get('contextSelections', [])]})
    for preparation in index.get('preparations', []):
        records.extend(load(preparation['requests']))
    resource = {'study': name, 'actualRequests': len(records), 'requestErrors': sum(bool(record.get('error')) for record in records),
                'knownTokenSubtotal': sum(record.get('usage', {}).get('totalTokens', 0) for record in records),
                'unknownUsageRequests': sum('totalTokens' not in record.get('usage', {}) for record in records)}
    resources.append(resource)
    studies.append({'study': name, 'indexStatus': index['status'], 'plannedRuns': index['expectedRuns'], 'recordedRuns': len(index['runs']), 'statusCounts': dict(counts),
                    'missingRuns': index['expectedRuns'] - len(index['runs']), 'commonPreparations': len(index.get('preparations', [])), 'agentFingerprint': index['agentFingerprint'], 'sandboxImage': index['sandboxImage'],
                    'summary': metrics['summary'], 'rows': metrics['rows'], 'details': row_details})
    if archive:
        archive.close()
total = {key: sum(item[key] for item in resources) for key in ['actualRequests', 'requestErrors', 'knownTokenSubtotal', 'unknownUsageRequests']}
total['completeTokenTotal'] = None if total['unknownUsageRequests'] else total['knownTokenSubtotal']
result = {'scope': 'Development compatibility studies and controlled challenges. No independent human semantic labels; no hidden or replaced failures. Source revisions remain separate.', 'studies': studies, 'resources': {'studies': resources, 'total': total}}
(root / 'summary.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'studies': [{key: study[key] for key in ['study', 'plannedRuns', 'recordedRuns', 'statusCounts', 'missingRuns']} for study in studies], 'actualResources': total}))
