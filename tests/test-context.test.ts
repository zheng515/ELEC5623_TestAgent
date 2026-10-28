import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectTestContext, measurementContext } from '../lib/test-context';
import type { Measurement } from '../lib/python-types';

test('model node selection stays bounded and spans files without changing the full execution catalog', () => {
  const nodes = [...Array.from({ length: 27_000 }, (_, index) => `tests/test_version.py::test_version[${index}]`), 'tests/test_requirements.py::test_extras', 'tests/test_utils.py::test_name'];
  const original = [...nodes];
  const selected = selectTestContext(nodes, 'version requirements extras name');
  assert.equal(selected.nodes.length, 200);
  assert.ok(selected.nodes.includes('tests/test_requirements.py::test_extras'));
  assert.ok(selected.nodes.includes('tests/test_utils.py::test_name'));
  assert.equal(selected.scope.totalNodes, 27_002);
  assert.equal(selected.scope.omittedNodes, 26_802);
  assert.deepEqual(nodes, original);
  const tiny = selectTestContext(nodes, 'version', 200, 50);
  assert.ok(tiny.scope.selectedBytes <= 50);
});

test('model measurement summaries retain actual global counts, failures and generated checks', () => {
  const outcomes: Measurement['outcomes'] = Array.from({ length: 1000 }, (_, i) => ({ node: `tests/a.py::test_a[${i}]`, file: 'tests/a.py', name: `test_a[${i}]`, status: 'passed', message: '' }));
  outcomes.push({ node: 'tests/a.py::test_fail', file: 'tests/a.py', name: 'test_fail', status: 'failed', message: 'actual failure' }, { node: 'reqtest_generated/test_reqtest_T1.py::test_new', file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_new', status: 'passed', message: '' });
  const measurement: Measurement = { outcomes, integrity: true, exitCode: 1, timedOut: false, log: 'raw' };
  const selected = measurementContext(measurement, [outcomes[0].node])!;
  assert.equal(selected.outcomeScope.total, 1002);
  assert.equal(selected.outcomeScope.counts.failed, 1);
  assert.equal(selected.outcomeScope.counts.passed, 1001);
  assert.equal(selected.outcomeScope.omitted, 999);
  assert.ok(selected.outcomes.some(item => item.message === 'actual failure'));
  assert.ok(selected.outcomes.some(item => item.file.startsWith('reqtest_generated/')));
  assert.equal(measurement.outcomes.length, 1002);
});
