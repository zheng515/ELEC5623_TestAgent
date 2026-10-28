import { createHash } from 'node:crypto';
import type { PythonTest } from './python-types';

// Compare executable artifacts independently of later review/mapping metadata.
export function executableSuiteHash(tests: PythonTest[]) {
  return createHash('sha256').update(JSON.stringify(tests.map(({ id, functionName, code }) => ({ id, functionName, code })))).digest('hex');
}
