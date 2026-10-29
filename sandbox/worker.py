"""Inspect and measure disposable copies. Never import a submitted project on the host."""
import ast
import base64
import hashlib
import importlib.metadata
import platform
import json
import os
from pathlib import Path
import shutil
import shlex
import sqlite3
import subprocess
import signal
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

PROJECT = Path('/work/project')
# Pytest, dependency setup and mutation run inside RUN; reported paths stay relative to PROJECT.
RUN = ''
GENERATED = 'reqtest_generated'


def to_project(path):
    return path if not RUN or path == GENERATED or path.startswith(GENERATED + '/') else RUN + '/' + path


def to_run(path):
    if not RUN or path == GENERATED or path.startswith(GENERATED + '/'):
        return path
    if not path.startswith(RUN + '/'):
        raise ValueError('Selected tests and mutation targets must be inside the run directory.')
    return path[len(RUN) + 1:]


def pytest_args():
    plugins = []
    for package, module in [('pytest-timeout', 'pytest_timeout'), ('pytest-xprocess', 'xprocess')]:
        try:
            importlib.metadata.version(package)
            plugins.extend(['-p', module])
        except importlib.metadata.PackageNotFoundError:
            pass
    # xprocess needs cacheprovider. Keep its files outside the fingerprinted source.
    return ['-p', 'reqtest_browser', '-p', 'reqtest_collection', '-o', 'cache_dir=/tmp/reqtest-pytest-cache', *plugins, *(['--rootdir', '.'] if RUN else [])]


def text_file(name):
    import re
    return bool(re.search(r'\.(py|[cm]?[jt]sx?|md|rst|txt|toml|cfg|ini|json|lock|html?|css|csv|xml|ya?ml|metadata|svg)$', name) or re.search(r'(?:^|/)(?:LICENSE(?:[.][\w-]+)?|COPYING|NOTICE)$', name))


def collected_nodes():
    path = Path('/tmp/reqtest-collection.json')
    if not path.exists():
        return {'nodes': [], 'totalNodes': 0, 'error': 'Structured collection evidence is missing.'}
    return json.loads(path.read_text())


def local_metadata():
    """Expose only explicit static name/version metadata; never run build hooks."""
    if not Path('pyproject.toml').is_file():
        return None
    try:
        from packaging.version import Version
        import re
        project = tomllib.loads(Path('pyproject.toml').read_text()).get('project', {})
        name, version = project.get('name', ''), project.get('version', '')
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9._-]*', name) or not isinstance(version, str) or len(version) > 200 or '\n' in version or '\r' in version:
            return None
        Version(version)
        directory = Path('/tmp/reqtest-local-metadata') / (re.sub(r'[-_.]+', '_', name) + '-' + version + '.dist-info')
        directory.mkdir(parents=True, exist_ok=True)
        (directory / 'METADATA').write_text(f'Metadata-Version: 2.1\nName: {name}\nVersion: {version}\n')
        return name + '==' + version + ' (static project declaration; no build/install)'
    except (ValueError, TypeError):
        return None


def requirement_lines():
    """Declarations from *requirements*.txt, following -r/--requirement includes inside the run directory."""
    lines, seen = [], set()

    def read(path):
        resolved = path.resolve()
        if resolved in seen:
            return
        seen.add(resolved)
        if not resolved.is_relative_to(Path.cwd().resolve()) or not resolved.is_file():
            raise ValueError(f'Requirement include {path} must name a file inside the run directory.')
        for line in resolved.read_text().splitlines():
            line = line.split(' #')[0].strip()
            if not line or line.startswith('#'):
                continue
            option, _, target = line.partition(' ')
            if option in ('-r', '--requirement') and target.strip():
                read(resolved.parent / target.strip())
            elif line.startswith('--requirement='):
                read(resolved.parent / line.split('=', 1)[1].strip())
            else:
                lines.append(line)

    for path in sorted(Path('.').glob('*requirements*.txt')):
        read(path)
    return list(dict.fromkeys(lines))


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
    requirements.extend(requirement_lines())
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
    process = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, start_new_session=True)
    try:
        output, _ = process.communicate(timeout=timeout)
        return process.returncode, output[-24000:], False
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        output, _ = process.communicate()
        return -1, output[-23000:] + f'\nCommand exceeded {timeout} seconds; its process group was stopped.', True


def project_files():
    return [path for path in sorted(PROJECT.rglob('*')) if path.is_file()]


def fingerprint(excluded=()):
    digest = hashlib.sha256()
    for path in project_files():
        name = str(path.relative_to(PROJECT))
        if '__pycache__' not in path.parts and name not in excluded:
            digest.update(name.encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def inspect():
    files, functions, errors, assets = {}, [], [], []
    for path in project_files():
        name = str(path.relative_to(PROJECT))
        if not text_file(name):
            assets.append({'file': name, 'bytes': path.stat().st_size, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
            continue
        text = path.read_text()
        files[name] = text
        if path.suffix != '.py':
            continue
        try:
            tree = ast.parse(text)
            for node in ast.walk(tree):
                if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    functions.append({'file': name, 'name': node.name, 'line': node.lineno, 'end': node.end_lineno})
        except SyntaxError as error:
            errors.append(str(error))
    code, log, timed = command([sys.executable, '-m', 'pytest', '--collect-only', '-q', *pytest_args()], 30)
    catalog = collected_nodes()
    nodes = [to_project(node) for node in catalog['nodes'] if to_project(node).split('::')[0] in files]
    complete = not timed and not catalog.get('error') and len(nodes) == catalog['totalNodes']
    if catalog.get('error'):
        errors.append(catalog['error'])
        log += '\n' + catalog['error']
        code = code or 2
    if not complete and code == 0:
        code = 2
        log += '\nSome collected nodes could not be mapped to imported files.'
    environment = {'python': platform.python_version(), 'pytest': importlib.metadata.version('pytest'), 'mutmut': importlib.metadata.version('mutmut'), 'pytestPlugins': 'reqtest_browser, reqtest_collection; optional installed pytest-timeout / pytest-xprocess explicitly enabled', 'localMetadata': local_metadata() or 'No static name/version declaration'}
    return {'environment': environment, 'files': files, 'assets': assets, 'functions': functions, 'nodes': nodes, 'testFiles': sorted({node.split('::')[0] for node in nodes}), 'collection': {'exitCode': code, 'log': log, 'timedOut': timed, 'totalNodes': catalog['totalNodes'], 'complete': complete}, 'errors': errors}


def measure(job):
    before = fingerprint()
    paths = [to_run(node) for node in job.get('nodes') or []]
    if job.get('generated'):
        shutil.copytree('/generated', GENERATED, dirs_exist_ok=True)
        paths.append(GENERATED)
    if not paths:
        return {'outcomes': [], 'exitCode': 5, 'log': 'No selected tests.', 'timedOut': False, 'integrity': True}
    execution_fingerprint = fingerprint()
    original_files = {str(path.relative_to(PROJECT)) for path in project_files()}
    # One unloadable test module is recorded as its own error instead of stopping every other test.
    code, log, timed = command([sys.executable, '-m', 'pytest', '-q', *pytest_args(), '--continue-on-collection-errors', '-o', 'junit_family=legacy', '--junitxml=/tmp/results.xml', '--', *paths], int(job['seconds']))
    outcomes = []
    # Failed browser tests leave a screenshot keyed by their pytest node ID.
    screenshots = {}
    for marker in Path('/work/screenshots').glob('*.txt'):
        parts = to_project(marker.read_text()).split('::')
        image = marker.with_suffix('.jpg')
        if image.is_file():
            screenshots[parts[0] + '::' + parts[-1]] = base64.b64encode(image.read_bytes()).decode()
    catalog = collected_nodes()
    if Path('/tmp/results.xml').exists():
        node_map = {}
        for node in catalog['nodes']:
            full = to_project(node)
            head, bracket, parameters = full.partition('[')
            name = head.split('::')[-1] + bracket + parameters
            node_map.setdefault((full.split('::')[0], name), []).append(full)
        for case in ET.parse('/tmp/results.xml').iter('testcase'):
            status, message = 'passed', ''
            for tag, value in [('failure', 'failed'), ('error', 'error'), ('skipped', 'skipped')]:
                detail = case.find(tag)
                if detail is not None:
                    status, message = value, (detail.text or detail.get('message', ''))[-12000:]
            filename = to_project(case.get('file', ''))
            name = case.get('name', '')
            candidates = node_map.get((filename, name), [])
            class_name = case.get('classname', '')
            matching = [node for node in candidates if len(node.partition('[')[0].split('::')) < 3 or class_name.endswith('.' + '.'.join(node.partition('[')[0].split('::')[1:-1]))]
            node_id = matching[0] if len(matching) == 1 else filename + '::' + name
            outcome = {'node': node_id, 'file': filename, 'name': name, 'status': status, 'message': message}
            if status in ('failed', 'error') and filename + '::' + name in screenshots:
                outcome['screenshot'] = screenshots[filename + '::' + name]
            outcomes.append(outcome)
    runtime_artifacts = []
    for path in project_files():
        name = str(path.relative_to(PROJECT))
        if name not in original_files and path.suffix in {'.db', '.sqlite', '.sqlite3'}:
            with path.open('rb') as stream:
                if stream.read(16) == b'SQLite format 3\x00':
                    stream.seek(0)
                    runtime_artifacts.append({'file': name, 'kind': 'sqlite', 'sha256': hashlib.file_digest(stream, 'sha256').hexdigest()})
    outputs = {item['file'] for item in runtime_artifacts}
    unchanged = execution_fingerprint == fingerprint(outputs)
    shutil.rmtree(GENERATED, ignore_errors=True)
    if catalog.get('error'):
        log += '\n' + catalog['error']
        code = code or 2
    return {'outcomes': outcomes, 'exitCode': code, 'log': log, 'timedOut': timed, 'integrity': unchanged and before == fingerprint(outputs), 'runtimeArtifacts': runtime_artifacts}


def mutation_scope(job):
    candidates = []
    tests = [ast.parse(path.read_text()) for path in Path(GENERATED).glob('*.py')]
    for filename in [to_run(file) for file in job.get('files') or [job['file']]]:
        path = Path(filename)
        if path.is_absolute() or '..' in path.parts or path.suffix != '.py' or not path.is_file():
            raise ValueError('Mutation targets must be saved Python source files.')
        definitions = {node.name: node for node in ast.parse(path.read_text()).body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))}
        module = filename.removesuffix('.py').replace('/', '.')
        modules = {module, module.removeprefix('src.'), module.removesuffix('.__init__')}
        called = set()
        for tree in tests:
            bindings = {}
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        if alias.name in modules:
                            bindings.update({(alias.asname or alias.name) + '.' + name: name for name in definitions})
                elif isinstance(node, ast.ImportFrom):
                    for alias in node.names:
                        if not node.level and node.module in modules:
                            bindings[alias.asname or alias.name] = alias.name
                        elif not node.level and str(node.module) + '.' + alias.name in modules:
                            bindings.update({(alias.asname or alias.name) + '.' + name: name for name in definitions})
            called.update(bindings.get(ast.unparse(node.func)) for node in ast.walk(tree) if isinstance(node, ast.Call))
        names = set(job['functions']) if job.get('functions') is not None else called
        selected = [node for name, node in definitions.items() if name in names]
        lines = sorted({line for node in selected for line in range(node.lineno, node.end_lineno + 1)})
        candidates.append({'file': filename, 'functions': [node.name for node in selected], 'lines': lines, 'kind': 'functions' if selected else 'file', 'suite': 'approved_generated'})
    return max(candidates, key=lambda scope: len(scope['functions']))


def mutate(job):
    shutil.copytree('/generated', GENERATED, dirs_exist_ok=True)
    scope = mutation_scope(job)
    selection = []
    if scope['lines']:
        # A selection patch supplies line numbers to mutmut; it is never applied to source.
        source = Path(scope['file']).read_text().splitlines()
        patch = '--- ' + scope['file'] + '\n+++ ' + scope['file'] + '\n'
        for line in scope['lines']:
            patch += f'@@ -0,0 +{line},1 @@\n+' + source[line - 1] + '\n'
        Path('/tmp/mutation-selection.patch').write_text(patch)
        selection = ['--use-patch-file', '/tmp/mutation-selection.patch']
    seconds = min(75, max(1, int(job.get('seconds', 75))))
    nodes = list(dict.fromkeys(to_run(node) for node in job.get('nodes') or []))
    for node in nodes:
        path = Path(node.split('::')[0])
        if path.is_absolute() or '..' in path.parts or 'reqtest_generated' in path.parts or path.suffix != '.py' or not path.is_file():
            raise ValueError('Mutation setup must use saved existing test nodes.')
    setup = {}
    for node in nodes:
        path = Path(node.split('::')[0])
        conftest = path.parent / 'conftest.py'
        setup.setdefault(str(path.parent), str(conftest if conftest.is_file() else path))
    scope['setupFiles'] = list(setup.values())
    # Prefer each directory's conftest; otherwise collect a representative module.
    # All original assertions are deselected; unrelated modules need not be loaded.
    runner = shlex.join([sys.executable, '-m', 'pytest', '-q', *pytest_args(), '-o', 'addopts=', *['--deselect=' + file for file in scope['setupFiles']], '--', *scope['setupFiles'], 'reqtest_generated'])
    # CLI values override any project-supplied mutmut hooks/configuration.
    code, log, timed = command(['mutmut', 'run', '--paths-to-mutate', scope['file'], *selection, '--tests-dir', 'reqtest_generated', '--runner', runner, '--pre-mutation', '', '--post-mutation', '', '--simple-output', '--no-progress', '--test-time-base', '1'], seconds)
    _, xml, _ = command(['mutmut', 'junitxml'], 10)
    mutants, diffs = [], {}
    try:
        for case in ET.fromstring(xml).iter('testcase'):
            detail = case.find('failure')
            if detail is not None:
                diffs[case.get('name', '')] = (detail.text or '')[:8000]
    except ET.ParseError:
        log += '\nMutant XML unavailable; inspecting cached outcomes instead.'
    try:
        with sqlite3.connect('.mutmut-cache', timeout=2) as cache:
            rows = cache.execute('SELECT m.id, s.filename, l.line_number, m.status FROM Mutant m JOIN Line l ON m.line=l.id JOIN SourceFile s ON l.sourcefile=s.id').fetchall()
        for ident, filename, line, status in rows:
            key = 'Mutant #' + str(ident)
            diff = diffs.get(key, '')
            if not diff:
                try:
                    diff = get_unified_diff(ident, [], update_cache=False)[:8000]
                except Exception:
                    log += f'\nMutation diff unavailable for {key}.'
            mutants.append({'id': key, 'file': to_project(filename), 'line': line + 1, 'status': {'ok_killed': 'killed', 'bad_survived': 'survived'}.get(status, 'unknown'), 'diff': diff})
    except sqlite3.Error:
        log += '\nMutation evidence unavailable. No score can be established.'
    scope = {**scope, 'file': to_project(scope['file']), 'setupFiles': [to_project(file) for file in scope['setupFiles']]}
    return {'mutants': mutants[:200], 'log': log, 'timedOut': timed, 'scope': scope, 'totalMutants': len(mutants), 'incomplete': timed or bool(code & 1) or not mutants or len(mutants) > 200 or any(not mutant['diff'] or mutant['status'] == 'unknown' for mutant in mutants)}



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
    shutil.copytree('/project', PROJECT, dirs_exist_ok=True)
    RUN = (job.get('runDirectory') or '').strip('/')
    if RUN and (Path(RUN).is_absolute() or '..' in Path(RUN).parts or not (PROJECT / RUN).is_dir()):
        print(json.dumps({'error': 'The run directory must be an existing directory inside the project.'}))
        sys.exit(1)
    os.chdir(PROJECT / RUN)
    active_paths = ['/opt/reqtest-deps', str(PROJECT / RUN), str(PROJECT / RUN / 'src'), '/tmp/reqtest-local-metadata', '/tool/plugins']
    os.environ['PYTHONPATH'] = ':'.join(active_paths)
    path_config = Path('/tmp/reqtest-python-paths')
    path_config.mkdir(exist_ok=True)
    (path_config / 'project.pth').write_text('\n'.join(active_paths) + '\n')
    local_metadata()
    if job['action'] == 'prepare':
        from prepare import prepare_project
        try:
            print(json.dumps(prepare_project(job.get('runtime', 'python'), requirement_lines)))
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
