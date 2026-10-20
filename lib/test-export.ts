import JSZip from 'jszip';
import { testFile } from './runtime';
import type { PythonReport } from './python-types';

export function testArchive(report: PythonReport, reportFile = 'verification.json') {
  const zip = new JSZip(), tests = report.tests.filter(test => test.approved), latest = report.measurements.at(-1);
  const setupFiles = report.mutations?.at(-1)?.scope?.setupFiles || [];
  const quote = (value: string) => /^[\w./=:-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\"'\"'") + "'";
  const pythonCommand = setupFiles.length ? ['python', '-m', 'pytest', ...setupFiles.map(file => '--deselect=' + file), '--', ...setupFiles, 'reqtest_generated'].map(quote).join(' ') : 'python -m pytest reqtest_generated';
  for (const test of tests) zip.file(testFile(test.id, report.runtime), test.code);
  zip.file(reportFile, JSON.stringify(report, null, 2));
  zip.file('README.md', [
    '# Generated requirement tests', '',
    'Extract this archive at the root of the original project, so reqtest_generated sits beside the source files.',
    'Use the exact source version below. Install your project dependencies and the test runner in your development environment.', '',
    'Source: ' + report.source,
    'Project directory within the original repository/archive: ' + (report.projectSetup?.projectDirectory || '(root)'),
    'Source SHA-256: ' + report.fingerprint,
    'Runtime: ' + (report.runtime === 'node' ? 'Node.js 22 / node:test with tsx 4.23.0' : 'Python 3.11 / pytest 8.4.2'),
    'Approved generated test files: ' + tests.length, '',
    'Run from the project root:', '', '```sh',
    report.runtime === 'node' ? 'npx --yes tsx@4.23.0 --test reqtest_generated/*.test.ts' : pythonCommand,
    '```', '',
    ...(report.runtime !== 'node' && setupFiles.length ? ['Representative original test modules are collected for their saved directory setup, then their test functions are deselected. Only generated test functions execute. Collection hooks and module import effects remain part of raw outcomes. Their helper files and conftest configuration must remain available in the original project.', ''] : []),
    'Saved workflow status: ' + report.status,
    latest ? 'Recorded latest execution: ' + latest.outcomes.filter(outcome => outcome.status === 'passed').length + ' passed, ' + latest.outcomes.filter(outcome => outcome.status === 'failed').length + ' failed, ' + latest.outcomes.filter(outcome => outcome.status === 'error').length + ' errors.' : 'No execution evidence was recorded.',
    'Review ' + reportFile + ' for original requirement sources, test reviews, setup information, diagnoses and execution logs.', '',
    'This archive does not include the implementation, dependency installation, disposable services or Docker images.',
    'Replicate the saved environment and services if the tests require them. A failing assertion can indicate an implementation defect; do not change the expected result merely to make it pass.',
    'Passing recorded cases does not establish exhaustive requirement coverage or correctness.', '',
  ].join('\n'));
  return zip;
}
