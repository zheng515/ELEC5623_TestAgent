"""Install registry packages inside a disposable build container, without lifecycle hooks."""
import importlib.metadata
import json
from pathlib import Path
import shutil
import subprocess
import tomllib
from urllib.parse import urlparse
from packaging.requirements import Requirement


def prepare_project(runtime):
    if runtime == 'node':
        if not Path('package-lock.json').exists():
            raise ValueError('Automatic Node setup requires package-lock.json.')
        lock = json.loads(Path('package-lock.json').read_text())
        if lock.get('lockfileVersion', 0) < 2:
            raise ValueError('Use an npm lockfile version 2 or newer.')
        for name, package in lock.get('packages', {}).items():
            if not name:
                continue
            url = urlparse(package.get('resolved', ''))
            if url.scheme != 'https' or url.hostname != 'registry.npmjs.org' or not package.get('integrity') or package.get('link'):
                raise ValueError('Automatic setup supports integrity-checked npm registry packages only, without file/git/workspace links.')
        for name in ['package.json', 'package-lock.json']:
            shutil.copyfile(name, '/opt/reqtest-node/' + name)
        command = ['node', '/opt/npm/bin/npm-cli.js', 'ci', '--prefix', '/opt/reqtest-node', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '--cache=/tmp/npm-cache']
    else:
        values = []
        if Path('pyproject.toml').exists():
            project = tomllib.loads(Path('pyproject.toml').read_text()).get('project', {})
            if 'dependencies' in project.get('dynamic', []):
                raise ValueError('Dynamic Python dependencies cannot be installed automatically.')
            values.extend(project.get('dependencies', []))
        for path in sorted(Path('.').glob('*requirements*.txt')):
            values.extend(line.split(' #')[0].strip() for line in path.read_text().splitlines() if line.strip() and not line.strip().startswith('#'))
        requirements = []
        for value in dict.fromkeys(values):
            try:
                item = Requirement(value)
            except Exception:
                raise ValueError('Use ordinary package/version requirements; include files, pip flags and editable dependencies are unsupported.')
            if item.url:
                raise ValueError('Direct URL dependencies are unsupported. Use PyPI packages.')
            if not item.marker or item.marker.evaluate():
                requirements.append(str(item))
        if not requirements:
            return {'installed': [], 'log': 'No declared Python dependencies.'}
        command = ['python', '-m', 'pip', 'install', '--disable-pip-version-check', '--no-cache-dir', '--only-binary=:all:', '--index-url', 'https://pypi.org/simple', '--target', '/opt/reqtest-deps', *requirements]
    result = subprocess.run(command, text=True, capture_output=True, timeout=180)
    if result.returncode:
        raise ValueError('Dependency installation failed. A compatible wheel/lockfile may be unavailable; native install scripts are not executed. ' + (result.stderr + result.stdout)[-2000:])
    if runtime == 'node':
        installed = []
        for name in lock.get('packages', {}):
            manifest = Path('/opt/reqtest-node') / name / 'package.json'
            if name and manifest.exists():
                package = json.loads(manifest.read_text())
                installed.append(name + '@' + str(package.get('version', 'unknown')))
    else:
        installed = sorted(item.metadata['Name'] + '==' + item.version for item in importlib.metadata.distributions(path=['/opt/reqtest-deps']))
    return {'installed': installed, 'log': 'Registry dependencies installed; project/build hooks were not executed.'}
