import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolve } from 'node:path';

test('mutation evidence bounds cache reads and diff work while preserving incomplete outcomes', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 10000 }, async () => {
  const { stdout } = await promisify(execFile)('docker', ['run', '--rm', '--network', 'none', '--read-only', '--cap-drop=ALL', '--security-opt=no-new-privileges', '--tmpfs', '/work:rw,mode=1777', '--tmpfs', '/generated:rw,mode=1777', '--tmpfs', '/project:rw,mode=1777', '--tmpfs', '/tmp:rw,mode=1777', '--mount', `type=bind,src=${resolve('tests/fixtures/mutation-evidence.py')},dst=/fixture.py,readonly`, '--entrypoint', 'python', 'reqtest-python:1', '/fixture.py'], { timeout: 8000 });
  const results = JSON.parse(stdout);
  assert.equal(results.length, 3);
  assert.equal(results[0].diffCalls, 200);
  assert.equal(results[1].diffCalls, 0);
  assert.equal(results[2].incomplete, false);
});
