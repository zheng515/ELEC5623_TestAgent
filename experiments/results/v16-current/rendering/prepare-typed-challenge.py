"""Adaptive C04 revision: add missing type witnesses without changing the contract or fault."""
from pathlib import Path
import json
import shutil
import sys

old_id = 'C01-click-valid-failure'
semantic = '--semantic' in sys.argv
new_id = 'C05-click-semantic-valid-failure' if semantic else 'C04-click-typed-valid-failure'
addition = 'assert all(isinstance(value, int) and not isinstance(value, bool) for value in seen)' if semantic else 'assert all(type(value) is int for value in seen)'
base = Path('examples/real-projects-v16')
destination = base / new_id
project = Path('.evidence/real-projects-v16/challenges') / new_id / 'project'
if destination.exists() or project.exists():
    raise SystemExit('Archive existing C04 before preparing another revision')
shutil.copytree(base / old_id, destination)
shutil.copytree(Path('.evidence/real-projects-v16/challenges') / old_id / 'project', project)
tests = json.loads((destination / 'initial-tests.json').read_text())
tests['tests'][0]['code'] += '        ' + addition + '\n'
tests['tests'][0]['purpose'] = 'Adaptive controlled valid-failure candidate with explicit integer callback-type witnesses.'
(destination / 'initial-tests.json').write_text(json.dumps(tests, indent=2) + '\n')
predicate = 'isinstance(value, int) and not isinstance(value, bool)' if semantic else 'type(value) is int'
(destination / 'oracle.py').write_text("import click\ndef test_contract():\n    for raw, expected in [('1', 1), ('3', 3)]:\n        value = click.IntRange(1, 3).convert(raw, None, None)\n        assert " + predicate + " and value == expected\n")
manifest = json.loads(Path('examples/experiments-real-challenges-v16.json').read_text())
case = dict(manifest['cases'][0], id=new_id, project=str(project), requirements=str(destination / 'requirements.txt'), gold=str(destination / 'gold.json'), initialTests=str(destination / 'initial-tests.json'), oracle=str(destination / 'oracle.py'))
manifest['cases'] = [case]
Path('examples/experiments-real-semantic-v16.json' if semantic else 'examples/experiments-real-typed-v16.json').write_text(json.dumps(manifest, indent=2) + '\n')
(destination / 'provenance.json').write_text(json.dumps({'scope': 'Separate adaptive revision after C01 was blocked for missing type assertions. C04 additionally required an unsupported concrete built-in class; C05 uses the existing semantic isinstance-style assertion policy. Same complete Click runtime, original contract, source fault, model, image and budget. Not an independent project or held-out result.', 'parentCase': 'C04-click-typed-valid-failure' if semantic else old_id, 'caseId': new_id, 'onlyCandidateAddition': addition, 'referenceSource': 'AI-assisted developer-controlled intervention, not human annotation.'}, indent=2) + '\n')
print('Prepared separate typed valid-failure revision, 9 planned workflow rows.')
