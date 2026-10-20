"""Inspect and measure disposable copies. Never import a submitted project on the host."""
import ast
import hashlib
import importlib.metadata
import platform
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys
import site
site.addsitedir("/opt/reqtest-deps")
sys.path.remove("/opt/reqtest-deps")
sys.path.insert(0, "/opt/reqtest-deps")
import xml.etree.ElementTree as ET
from mutmut.cache import get_unified_diff
import tomllib
import importlib.util
from packaging.requirements import Requirement
from packaging.specifiers import SpecifierSet


def preflight():
    checks, requirements, declared = [], [], set()
    project = {}
    if Path('pyproject.toml').exists():
        try:
            project = tomllib.loads(Path('pyproject.toml').read_text()).get('project', {})
            requirements.extend(project.get('dependencies', []))
            if project.get('dynamic'):
                checks.append({'label': 'Dynamic project metadata', 'status': 'unknown', 'detail': 'Dynamic dependencies are not executed or resolved.'})
            if project.get('optional-dependencies'):
                checks.append({'label': 'Optional dependencies', 'status': 'unknown', 'detail': 'Project extras are not installed or selected automatically.'})
            required = project.get('requires-python')
            if required:
                matches = SpecifierSet(required).contains(platform.python_version())
                checks.append({'label': 'Python ' + required, 'status': 'passed' if matches else 'failed', 'detail': 'Sandbox Python ' + platform.python_version()})
        except Exception:
            checks.append({'label': 'pyproject.toml', 'status': 'unknown', 'detail': 'Project metadata could not be read statically.'})
    for path in sorted(Path('.').glob('*requirements*.txt')):
        for line in path.read_text().splitlines():
            line = line.split(' #')[0].strip()
            if line and not line.startswith('#'):
                requirements.append(line)
    for value in dict.fromkeys(requirements):
        try:
            requirement = Requirement(value)
            if requirement.url:
                raise ValueError()
            if requirement.marker and not requirement.marker.evaluate():
                continue
            declared.add(requirement.name)
            try:
                version = importlib.metadata.version(requirement.name)
                matches = not requirement.specifier or requirement.specifier.contains(version)
                checks.append({'label': value, 'status': 'passed' if matches else 'failed', 'detail': 'Installed: ' + version})
            except importlib.metadata.PackageNotFoundError:
                checks.append({'label': value, 'status': 'failed', 'detail': 'Package is not installed in this sandbox image.'})
        except Exception:
            checks.append({'label': value[:200], 'status': 'unknown', 'detail': 'Unsupported declaration. Use static package/version requirements in a prepared image.'})
    local = {path.stem for path in Path('.').glob('*.py')}
    local.update(path.name for base in [Path('.'), Path('src')] if base.exists() for path in base.iterdir() if path.is_dir())
    missing = set()
    for path in Path('.').rglob('*.py'):
        try:
            tree = ast.parse(path.read_text())
            for node in ast.walk(tree):
                names = [item.name.split('.')[0] for item in node.names] if isinstance(node, ast.Import) else [node.module.split('.')[0]] if isinstance(node, ast.ImportFrom) and node.module and not node.level else []
                for name in names:
                    if name not in local and name not in sys.stdlib_module_names and importlib.util.find_spec(name) is None:
                        missing.add(name)
        except (SyntaxError, ValueError):
            checks.append({'label': str(path), 'status': 'unknown', 'detail': 'Python source could not be inspected.'})
    for name in sorted(missing):
        checks.append({'label': 'Import: ' + name, 'status': 'unknown', 'detail': 'Module is unavailable. It may be optional, platform-specific or a missing project dependency.'})
    if len(checks) > 200:
        raise ValueError('Too many dependency declarations. Use a focused project.')
    status = 'needs_setup' if any(item['status'] == 'failed' for item in checks) else 'limited' if any(item['status'] == 'unknown' for item in checks) else 'ready'
    return {'status': status, 'python': platform.python_version(), 'checks': checks, 'limitations': ['Static checks do not import the project, start services or validate native runtime dependencies.', 'Automatic setup installs declared compatible wheels in a pinned image; project build hooks and native system packages are not installed.']}


def command(args, timeout=60):
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return result.returncode, (result.stdout + result.stderr)[-24000:], False
    except subprocess.TimeoutExpired as error:
        return -1, str(error.output or b"")[-24000:], True


def fingerprint():
    digest = hashlib.sha256()
    for path in sorted(Path('.').rglob('*')):
        if path.is_file() and '__pycache__' not in path.parts:
            digest.update(str(path).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def inspect():
    files, functions, errors = {}, [], []
    for path in sorted(Path('.').rglob('*')):
        if not path.is_file():
            continue
        text = path.read_text(errors='replace')
        files[str(path)] = text
        if path.suffix != '.py':
            continue
        try:
            tree = ast.parse(text)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    functions.append({'file': str(path), 'name': node.name, 'line': node.lineno, 'end': node.end_lineno})
        except SyntaxError as error:
            errors.append(str(error))
    code, log, timed = command([sys.executable, '-m', 'pytest', '--collect-only', '-q', '-p', 'no:cacheprovider'], 30)
    nodes = [line.strip() for line in log.splitlines() if '::' in line and line.split('::')[0] in files]
    return {'environment': {'python': platform.python_version(), 'pytest': importlib.metadata.version('pytest'), 'mutmut': importlib.metadata.version('mutmut')}, 'files': files, 'functions': functions, 'nodes': nodes[:200], 'collection': {'exitCode': code, 'log': log, 'timedOut': timed}, 'errors': errors}


def measure(job):
    before = fingerprint()
    paths = job.get('nodes') or []
    if job.get('generated'):
        shutil.copytree('/generated', '/work/project/reqtest_generated', dirs_exist_ok=True)
        paths.append('reqtest_generated')
    if not paths:
        return {'outcomes': [], 'exitCode': 5, 'log': 'No selected tests.', 'timedOut': False, 'integrity': True}
    execution_fingerprint = fingerprint()
    code, log, timed = command([sys.executable, '-m', 'pytest', '-q', '-p', 'no:cacheprovider', '-o', 'junit_family=legacy', '--junitxml=/tmp/results.xml', '--', *paths])
    outcomes = []
    if Path('/tmp/results.xml').exists():
        for case in ET.parse('/tmp/results.xml').iter('testcase'):
            status, message = 'passed', ''
            for tag, value in [('failure', 'failed'), ('error', 'error'), ('skipped', 'skipped')]:
                detail = case.find(tag)
                if detail is not None:
                    status, message = value, (detail.text or detail.get('message', ''))[-12000:]
            filename = case.get('file', '')
            name = case.get('name', '')
            candidates = [node for node in job.get('nodes', []) if node.startswith(filename + '::') and node.endswith('::' + name)]
            class_name = case.get('classname', '').split('.')[-1]
            matching = [node for node in candidates if len(node.split('::')) < 3 or node.split('::')[-2] == class_name]
            node_id = matching[0] if len(matching) == 1 else filename + '::' + name
            outcomes.append({'node': node_id, 'file': filename, 'name': name, 'status': status, 'message': message})
    unchanged = execution_fingerprint == fingerprint()
    shutil.rmtree('/work/project/reqtest_generated', ignore_errors=True)
    return {'outcomes': outcomes, 'exitCode': code, 'log': log, 'timedOut': timed, 'integrity': unchanged and before == fingerprint()}


def mutate(job):
    shutil.copytree('/generated', '/work/project/reqtest_generated', dirs_exist_ok=True)
    # CLI values override any project-supplied mutmut hooks/configuration.
    code, log, timed = command(['mutmut', 'run', '--paths-to-mutate', job['file'], '--tests-dir', 'reqtest_generated', '--runner', 'python -m pytest -q -p no:cacheprovider', '--pre-mutation', '', '--post-mutation', '', '--simple-output', '--no-progress', '--test-time-base', '1'], 75)
    _, xml, _ = command(['mutmut', 'junitxml'], 10)
    mutants, diffs = [], {}
    try:
        for case in ET.fromstring(xml).iter('testcase'):
            detail = case.find('failure')
            if detail is not None:
                diffs[case.get('name', '')] = (detail.text or '')[:8000]
        with sqlite3.connect('.mutmut-cache') as cache:
            rows = cache.execute('SELECT m.id, s.filename, l.line_number, m.status FROM Mutant m JOIN Line l ON m.line=l.id JOIN SourceFile s ON l.sourcefile=s.id').fetchall()
        for ident, filename, line, status in rows:
            key = 'Mutant #' + str(ident)
            diff = diffs.get(key, '')
            if not diff:
                try:
                    diff = get_unified_diff(ident, [], update_cache=False)[:8000]
                except Exception:
                    log += f'\nMutation diff unavailable for {key}.'
            mutants.append({'id': key, 'file': filename, 'line': line + 1, 'status': {'ok_killed': 'killed', 'bad_survived': 'survived'}.get(status, 'unknown'), 'diff': diff})
    except (ET.ParseError, sqlite3.Error):
        log += '\nMutation evidence unavailable. No score can be established.'
    return {'mutants': mutants[:200], 'log': log, 'timedOut': timed, 'incomplete': timed or bool(code & 1) or not mutants or len(mutants) > 200 or any(not mutant['diff'] for mutant in mutants)}



if __name__ == '__main__':
    job = json.load(sys.stdin)
    if job['action'] == 'document':
        from documents import extract_document
        try:
            result = extract_document(job)
        except Exception as error:
            result = {'error': str(error)[:500]}
        print(json.dumps(result))
        sys.exit(0)
    shutil.copytree('/project', '/work/project', dirs_exist_ok=True)
    os.chdir('/work/project')
    os.environ['PYTHONPATH'] = '/opt/reqtest-deps:/work/project:/work/project/src'
    if job['action'] == 'prepare':
        from prepare import prepare_project
        try:
            print(json.dumps(prepare_project(job.get('runtime', 'python'))))
        except Exception as error:
            print(json.dumps({'error': str(error)[:2500]}))
        sys.exit(0)
    if job.get('runtime') == 'node':
        result = subprocess.run(['node', '/tool/node-worker.cjs'], input=json.dumps(job), text=True, capture_output=True, timeout=100)
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        sys.exit(result.returncode)
    result = preflight() if job['action'] == 'preflight' else inspect() if job['action'] == 'inspect' else mutate(job) if job['action'] == 'mutate' else measure(job)
    print(json.dumps(result))
