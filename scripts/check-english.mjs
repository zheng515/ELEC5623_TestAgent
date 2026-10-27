import { execFileSync } from 'node:child_process';
import { readFile, lstat } from 'node:fs/promises';

// Inspect project-owned files, not dependencies, private data or imported evidence.
const paths = [...new Set(execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean))];
const forbidden = /[\p{Script=Han}\u3000-\u303f\uff00-\uffef]/u;
const findings = [];
let checked = 0;
for (const path of paths) {
  if (path.split('/').some((part) => part.startsWith('.env'))) continue;
  let metadata;
  try { metadata = await lstat(path); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  if (!metadata.isFile()) continue;
  if (forbidden.test(path)) findings.push(`${path}: disallowed characters in file name`);
  const bytes = await readFile(path);
  if (bytes.includes(0)) continue;
  checked++;
  bytes.toString('utf8').split(/\r?\n/).forEach((line, index) => {
    if (forbidden.test(line)) findings.push(`${path}:${index + 1}: Chinese characters or CJK/fullwidth punctuation`);
  });
}
if (findings.length) {
  console.error('English-only source check failed:\n' + findings.join('\n'));
  process.exitCode = 1;
} else console.log(`English-only source check passed: ${checked} text files checked.`);
