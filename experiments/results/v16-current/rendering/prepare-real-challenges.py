"""Prepare explicitly controlled challenges on complete pinned upstream runtimes."""
import hashlib
import json
from pathlib import Path
import shutil

OUTPUT = Path('.evidence/real-projects-v16/challenges')
CONFIG = Path('examples/real-projects-v16')


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    CONFIG.mkdir(parents=True, exist_ok=True)
    cases = []
    definitions = [
        ('C01-click-valid-failure', 'click', 'valid-failure', 'potential_implementation_defect',
         "For a command with option '--count' using click.IntRange(1, 3), the inputs '1' and '3' are accepted as integers 1 and 3 with exit_code 0. The inputs '0' and '4' are rejected with exit_code 2 and do not call the callback.",
         "import click\nfrom click.testing import CliRunner\ndef test_inclusive_range():\n    seen = []\n    @click.command()\n    @click.option('--count', type=click.IntRange(1, 3))\n    def command(count):\n        seen.append(count)\n    for number in [0, 1, 3, 4]:\n        seen.clear()\n        result = CliRunner().invoke(command, ['--count', str(number)])\n        assert result.exit_code == (0 if number in [1, 3] else 2)\n        assert seen == ([number] if number in [1, 3] else [])\n",
         "import click\ndef test_contract():\n    assert click.IntRange(1, 3).convert('1', None, None) == 1\n    assert click.IntRange(1, 3).convert('3', None, None) == 3\n"),
        ('C02-packaging-wrong-assertion', 'packaging', 'unsupported-assertion', 'generated_test_error',
         "packaging.utils.canonicalize_name returns 'django' for 'Django' and 'oslo-concurrency' for 'oslo.concurrency'.",
         "from packaging.utils import canonicalize_name\ndef test_canonical_names():\n    assert canonicalize_name('Django') == 'django'\n    assert canonicalize_name('oslo.concurrency') == 'oslo_concurrency'\n",
         "from packaging.utils import canonicalize_name\ndef test_contract():\n    assert canonicalize_name('Django') == 'django'\n    assert canonicalize_name('oslo.concurrency') == 'oslo-concurrency'\n"),
        ('C03-werkzeug-wrong-import', 'werkzeug', 'invented-import', 'generated_test_error',
         "werkzeug.datastructures.MultiDict([('a', 'b'), ('a', 'c')]) returns 'b' for dictionary access at key 'a', and getlist('a') returns ['b', 'c'] in that order. An empty MultiDict returns [] for getlist('missing').",
         "from werkzeug.datastructure import MultiDict\ndef test_multidict_values():\n    d = MultiDict([('a', 'b'), ('a', 'c')])\n    assert d['a'] == 'b'\n    assert d.getlist('a') == ['b', 'c']\n    assert MultiDict().getlist('missing') == []\n",
         "from werkzeug.datastructures import MultiDict\ndef test_contract():\n    d = MultiDict([('a', 'b'), ('a', 'c')])\n    assert d['a'] == 'b' and d.getlist('a') == ['b', 'c']\n    assert MultiDict().getlist('missing') == []\n"),
    ]
    provenance = []
    for case_id, upstream, challenge, category, text, code, oracle in definitions:
        source = Path('.evidence/opensource-candidates') / upstream / 'source'
        project = OUTPUT / case_id / 'project'
        if project.exists():
            raise ValueError(f'{project} already exists; archive prior attempts rather than overwriting them')
        shutil.copytree(source, project)
        rule = 'R1: ' + text
        gold = {'reviewed': False, 'reviewer': '', 'issues': [], 'inconsistencies': [], 'behaviors': [{'id': 'contract-1', 'ruleId': 'R1', 'description': text, 'initialGap': challenge != 'valid-failure'}]}
        edits = []
        if challenge == 'valid-failure':
            file = 'src/click/types.py'
            original = 'operator.le if self.min_open else operator.lt'
            faulty = 'operator.le if self.min_open else operator.le'
            path = project / file
            raw = path.read_text()
            assert raw.count(original) == 1
            path.write_text(raw.replace(original, faulty))
            gold['fault'] = {'id': 'closed-lower-bound-rejected', 'file': file, 'before': faulty, 'after': original}
            edits.append({'file': file, 'original': original, 'injected': faulty})
        base = CONFIG / case_id
        base.mkdir(exist_ok=True)
        (base / 'requirements.txt').write_text('Scope: controlled development challenge on the complete pinned upstream runtime. The original API contract below comes from the previously indexed public documentation. Seeded candidates are not trusted references.\n\n' + rule + '\n')
        (base / 'gold.json').write_text(json.dumps(gold, indent=2) + '\n')
        function = next(line.split('def ', 1)[1].split('(')[0] for line in code.splitlines() if line.startswith('def test_'))
        initial = {'tests': [{'id': 'T1', 'behaviorId': 'B1', 'functionName': function, 'gapIndexes': [0], 'code': code, 'quote': rule, 'purpose': 'Controlled ' + challenge + ' challenge, not natural generator-error frequency.'}]}
        (base / 'initial-tests.json').write_text(json.dumps(initial, indent=2) + '\n')
        (base / 'oracle.py').write_text(oracle)
        inventory = json.loads((source.parent / 'inventory.json').read_text())
        provenance.append({'caseId': case_id, 'upstream': inventory['repository'], 'commit': inventory['commit'], 'runtimeFiles': inventory['runtimeFiles'], 'runtimeLines': inventory['runtimeLines'], 'sourceEdits': edits, 'candidateInjection': challenge, 'referenceCategory': category, 'referenceSource': 'Developer/AI-assisted controlled intervention, independently executable fixed witnesses; not human semantic review. Admission blocks are not runtime diagnosis exposure.'})
        cases.append({'id': case_id, 'project': str(project), 'requirements': str(base / 'requirements.txt'), 'gold': str(base / 'gold.json'), 'initialTests': str(base / 'initial-tests.json'), 'oracle': str(base / 'oracle.py'), 'challenge': challenge, 'expectedDiagnosis': category})
    manifest = {'purpose': 'pilot', 'repeat': 3, 'variants': ['B1', 'B2', 'B3'], 'sharedInitialSuite': True, 'diagnosisAblation': True, 'followupRequestLimit': 12, 'policy': {'mutationChecks': False, 'modelRequestLimit': 32, 'modelTimeoutSeconds': 300}, 'cases': cases}
    Path('examples/experiments-real-challenges-v16.json').write_text(json.dumps(manifest, indent=2) + '\n')
    (CONFIG / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    (CONFIG / 'protocol.json').write_text(json.dumps({'scope': 'Controlled development perturbations of known pinned open-source projects; not natural defects, unseen hold-out data or independent projects.', 'selection': 'Frozen before any v16 challenge model calls. All planned rows, admission blocks, runtime failures, repair requests and costs must be retained.', 'sharedPreparation': 'Identical B1 candidates, analysis, admission and initial execution for B2/B3; follow-up order alternates. B2 unconditional repair, B3 grounded diagnosis. Same model/image/request ceiling.', 'sourceInventorySha256': hashlib.sha256((CONFIG / 'provenance.json').read_bytes()).hexdigest()}, indent=2) + '\n')
    print('Prepared three complete-runtime controlled challenges, 27 planned workflow rows.')


if __name__ == '__main__':
    main()
