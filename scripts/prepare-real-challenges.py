"""Copy pinned runtimes and inject declared faults; frozen case inputs stay unchanged."""
import json
from pathlib import Path
import shutil
import sys


def main():
    manifests = sys.argv[1:] or [
        'examples/experiments-real-challenges-v16.json',
        'examples/experiments-real-typed-v16.json',
        'examples/experiments-real-semantic-v16.json',
    ]
    provenance = {item['caseId']: item for item in json.loads(Path('examples/real-projects-v16/provenance.json').read_text())}
    cases = {case['id']: case for file in manifests for case in json.loads(Path(file).read_text())['cases']}
    # Refuse existing destinations before copying anything.
    for case in cases.values():
        if Path(case['project']).exists():
            raise ValueError(f"{case['project']} already exists; use a fresh evidence workspace")
    for case in cases.values():
        parent = case['id']
        while parent not in provenance:
            parent = json.loads((Path('examples/real-projects-v16') / parent / 'provenance.json').read_text())['parentCase']
        reference = provenance[parent]
        upstream = Path('.evidence/opensource-candidates') / reference['upstream'].split('/')[-1]
        inventory = json.loads((upstream / 'inventory.json').read_text())
        if inventory['commit'] != reference['commit']:
            raise ValueError(f"{case['id']}: upstream commit differs from frozen provenance")
        project = Path(case['project'])
        shutil.copytree(upstream / 'source', project)
        fault = json.loads(Path(case['gold']).read_text()).get('fault')
        if fault:
            path = project / fault['file']
            raw = path.read_text()
            if raw.count(fault['after']) != 1:
                raise ValueError(f"{case['id']}: fault target must occur exactly once")
            path.write_text(raw.replace(fault['after'], fault['before']))
        print(f"Prepared {case['id']}")


if __name__ == '__main__':
    main()
