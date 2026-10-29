const fs = require('node:fs'), path = require('node:path'), cp = require('node:child_process'), crypto = require('node:crypto');
const ts = require('/tool/node/node_modules/typescript'), semver = require('/tool/node/node_modules/semver'), diff = require('/tool/node/node_modules/diff');
const generated = '/work/project/reqtest_generated', loader = '/tool/node/node_modules/tsx/dist/loader.mjs';
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(item => item.name === 'node_modules' ? [] : item.isDirectory() ? walk(path.join(dir, item.name)) : [path.join(dir, item.name)]);
const fileList = () => walk('.').filter(file => fs.lstatSync(file).isFile());
const testPaths = () => fileList().filter(file => /(^|\/)(test[^/]*|[^/]*[.]test|[^/]*[.]spec)\.[cm]?[jt]s$/.test(file));
const fingerprint = () => {
  const hash = crypto.createHash('sha256');
  for (const file of walk('.').sort()) {
    const bytes = fs.lstatSync(file).isSymbolicLink() ? Buffer.from('link:' + fs.readlinkSync(file)) : fs.readFileSync(file);
    hash.update(file.length + ':' + file + ':' + bytes.length + ':').update(bytes);
  }
  return hash.digest('hex');
};
const escape = name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function measure(job, discover = false) {
  const before = fingerprint(), groups = new Map();
  if (job.generated) fs.cpSync('/generated', generated, { recursive: true });
  const afterCopy = fingerprint();
  if (discover || job.nodes?.includes('.')) for (const file of testPaths()) groups.set(file, []);
  else for (const node of job.nodes || []) {
    const [file, ...names] = node.split('::');
    groups.set(file, [...groups.get(file) || [], names.join('::')]);
  }
  if (job.generated) for (const file of fs.readdirSync(generated)) groups.set('reqtest_generated/' + file, []);
  const outcomes = [], logs = [], deadline = Date.now() + (discover ? 30000 : 60000);
  let exitCode = groups.size ? 0 : 5, timedOut = false;
  try {
    for (const [file, names] of groups) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) { timedOut = true; exitCode = -1; break; }
      const args = ['--import', loader, '--test', '--test-reporter=/tool/node-reporter.mjs'];
      if (names.length && !names.some(name => path.resolve(name) === path.resolve(file))) args.push('--test-name-pattern=^(?:' + names.map(escape).join('|') + ')$');
      const result = cp.spawnSync('node', [...args, '--', file], { encoding: 'utf8', timeout: remaining, maxBuffer: 2000000, killSignal: 'SIGKILL' });
      for (const line of (result.stdout || '').split('\n')) {
        try { const item = JSON.parse(line); if (item.node) outcomes.push(item); if (item.log) logs.push(item.log); } catch { logs.push(line); }
      }
      logs.push(result.stderr || '', result.error?.message || '');
      if (result.status !== 0) exitCode = result.status ?? -1;
      if (result.error) { timedOut = result.error.code === 'ETIMEDOUT'; break; }
    }
    const integrity = afterCopy === fingerprint();
    if (job.generated) fs.rmSync(generated, { recursive: true, force: true });
    return { outcomes, exitCode, log: [...logs, ...outcomes.filter(item => item.message).map(item => item.message)].join('\n').slice(-24000), timedOut, integrity: integrity && before === fingerprint() };
  } finally { if (job.generated) fs.rmSync(generated, { recursive: true, force: true }); }
}
function inspect() {
  const files = {}, functions = [], errors = [], assets = [];
  for (const file of fileList()) {
    if (!/\.(py|[cm]?[jt]sx?|md|rst|txt|toml|cfg|ini|json|lock|html?|css|csv|xml|ya?ml|metadata|svg)$/.test(file) && !/(^|\/)(LICENSE([.][\w-]+)?|COPYING|NOTICE)$/.test(file)) {
      const bytes = fs.readFileSync(file); assets.push({ file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') }); continue;
    }
    const text = fs.readFileSync(file, 'utf8'); files[file] = text;
    if (!/\.[cm]?[jt]sx?$/.test(file)) continue;
    const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const visit = node => { if (ts.isFunctionDeclaration(node) && node.name) functions.push({ file, name: node.name.text, line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1, end: ast.getLineAndCharacterOfPosition(node.end).line + 1 }); ts.forEachChild(node, visit); }; visit(ast);
    for (const error of ast.parseDiagnostics || []) errors.push(file + ': ' + ts.flattenDiagnosticMessageText(error.messageText, ' '));
  }
  const result = measure({}, true), counts = new Map();
  for (const item of result.outcomes) counts.set(item.node, (counts.get(item.node) || 0) + 1);
  const ambiguous = result.outcomes.some(item => item.nesting > 0 || counts.get(item.node) !== 1);
  if (ambiguous) errors.push('Use unique top-level node:test cases. Nested suites and duplicate names do not have supported traceable IDs.');
  if (!result.integrity) errors.push('Source changed during Node.js discovery; its evidence is invalid.');
  if (result.outcomes.length > 200) errors.push('More than 200 test cases were discovered. Submit a smaller test suite.');
  const failed = result.outcomes.length > 200 || ambiguous || result.timedOut || !result.integrity || result.outcomes.some(item => item.status === 'error') || result.exitCode !== 0 && result.exitCode !== 5 && !result.outcomes.length;
  const nodes = result.outcomes.filter(item => !item.nesting && counts.get(item.node) === 1).map(item => item.node);
  return { files, assets, functions, nodes: nodes.slice(0, 200), collection: { exitCode: failed ? 2 : 0, log: 'Node.js discovery executes existing node:test cases in a disposable sandbox.\n' + errors.join('\n') + '\n' + result.log, timedOut: result.timedOut, totalNodes: nodes.length, complete: nodes.length <= 200 && !failed }, errors, environment: { node: process.version, testRunner: 'node:test', typescript: ts.version, discovery: 'Existing tests execute during discovery; this is not static collection.' } };
}
function mutate(job) {
  fs.cpSync('/generated', generated, { recursive: true });
  const quote = file => "'" + file.replaceAll("'", "'\\''") + "'";
  const command = 'node --import ' + loader + ' --test -- ' + testPaths().map(quote).join(' ');
  const config = { mutate: [job.file], testRunner: 'command', commandRunner: { command }, coverageAnalysis: 'off', concurrency: 1, timeoutMS: 2000, timeoutFactor: 2, reporters: ['json'], jsonReporter: { fileName: '/work/mutation.json' }, tempDirName: '/work/mutation-temp', cleanTempDir: true, plugins: [], disableTypeChecks: true };
  fs.writeFileSync('/work/stryker.json', JSON.stringify(config));
  const result = cp.spawnSync('node', ['/tool/node/node_modules/@stryker-mutator/core/bin/stryker.js', 'run', '/work/stryker.json'], { encoding: 'utf8', timeout: 75000, maxBuffer: 2000000, killSignal: 'SIGKILL' });
  const mutants = []; let incomplete = !!result.error || result.status !== 0;
  try {
    const data = JSON.parse(fs.readFileSync('/work/mutation.json', 'utf8'));
    for (const [file, entry] of Object.entries(data.files)) for (const mutant of entry.mutants) {
      const offset = location => entry.source.split('\n').slice(0, location.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + location.column - 1;
      const changed = entry.source.slice(0, offset(mutant.location.start)) + mutant.replacement + entry.source.slice(offset(mutant.location.end));
      const patch = diff.createPatch(file, entry.source, changed);
      if (patch.length > 8000) incomplete = true;
      mutants.push({ id: 'Mutant #' + (Number(mutant.id) + 1), file, line: mutant.location.start.line, status: mutant.status === 'Killed' ? 'killed' : ['Survived', 'NoCoverage'].includes(mutant.status) ? 'survived' : 'unknown', diff: patch.slice(0, 8000) });
    }
  } catch { incomplete = true; }
  return { mutants: mutants.slice(0, 200), log: ((result.stdout || '') + (result.stderr || '')).slice(-24000), timedOut: result.error?.code === 'ETIMEDOUT', incomplete: incomplete || !mutants.length || mutants.length > 200 || mutants.some(mutant => mutant.status === 'unknown' || !mutant.diff) };
}
function preflight() {
  const checks = [], pkg = fs.existsSync('package.json') ? JSON.parse(fs.readFileSync('package.json', 'utf8')) : {};
  if (pkg.engines?.node) checks.push({ label: 'Node.js ' + pkg.engines.node, status: semver.satisfies(process.version, pkg.engines.node) ? 'passed' : 'failed', detail: 'Sandbox ' + process.version });
  for (const [name, range] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    const file = path.join('node_modules', name, 'package.json');
    if (!fs.existsSync(file)) { checks.push({ label: name, status: 'failed', detail: 'Package is unavailable. Use automatic setup with package-lock.json.' }); continue; }
    const installed = JSON.parse(fs.readFileSync(file, 'utf8')).version;
    checks.push({ label: name + '@' + range, status: semver.validRange(range) ? semver.satisfies(installed, range) ? 'passed' : 'failed' : 'unknown', detail: 'Installed: ' + installed });
  }
  if (pkg.devDependencies?.jest || pkg.devDependencies?.vitest) checks.push({ label: 'Existing test framework', status: 'unknown', detail: 'Jest/Vitest are not executed as their native frameworks. Only unique top-level node:test cases have supported traceable IDs.' });
  return { status: checks.some(item => item.status === 'failed') ? 'needs_setup' : checks.some(item => item.status === 'unknown') ? 'limited' : 'ready', python: process.version, checks, limitations: ['Dependency checks read package metadata and versions; they do not import project code or prove startup readiness.', 'Existing node:test cases execute during discovery; collection is not a static operation.', 'Only unique top-level node:test cases are supported; Jest/Vitest and nested suites are not supported.', 'Dependency lifecycle scripts and native build hooks are disabled.'] };
}
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    if (fs.existsSync('/opt/reqtest-node/node_modules')) fs.symlinkSync('/opt/reqtest-node/node_modules', 'node_modules', 'dir');
    const job = JSON.parse(input), result = job.action === 'preflight' ? preflight() : job.action === 'inspect' ? inspect() : job.action === 'mutate' ? mutate(job) : measure(job);
    console.log(JSON.stringify(result));
  } catch (error) { console.log(JSON.stringify({ error: error.message })); process.exitCode = 1; }
});
