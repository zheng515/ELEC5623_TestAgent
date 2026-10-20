import { relative, resolve } from 'node:path';
export default async function* report(events) {
  for await (const event of events) {
    if (['test:stdout', 'test:stderr'].includes(event.type)) {
      yield JSON.stringify({ log: event.data.message }) + '\n';
      continue;
    }
    if (!['test:pass', 'test:fail'].includes(event.type) || event.data.details?.type === 'suite') continue;
    const item = event.data, file = item.file ? relative(process.cwd(), item.file) : '';
    const error = item.details?.error, cause = error?.cause;
    const wrapper = file && resolve(item.name) === resolve(item.file);
    const message = event.type === 'test:fail' ? String(cause?.stack || error?.stack || error?.message || 'Test failed') : '';
    yield JSON.stringify({ node: file + '::' + item.name, file, name: item.name, nesting: item.nesting, status: item.skip || item.todo ? 'skipped' : event.type === 'test:pass' ? 'passed' : wrapper ? 'error' : 'failed', message }) + '\n';
  }
}
