import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runPython, type Reason } from '../lib/python-agent';
import { analysisSchema, testsSchema, reviewTestsSchema, diagnosisSchema, relevanceSchema, type Analysis, type Measurement, type PythonTest } from '../lib/python-types';
import { project, report, analysis, artifact, approval, code, rule } from './fixtures/python-agent';

// Scripted decisions test orchestration, not a model's ability to recognize hallucinations.
test('focused context preserves safety across unsupported assertions, bad imports, defects and ambiguity', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 120000 }, async t => {
  for (const scenario of ['unsupported_assertion', 'bad_import', 'implementation_defect', 'ambiguous_requirement'] as const) {
    await t.test(scenario, async t => {
      const exceptionRule = 'For a negative amount, shipping.fee(amount) raises ValueError.';
      const requirement = scenario === 'unsupported_assertion' ? exceptionRule : scenario === 'ambiguous_requirement' ? 'For a large amount, shipping.fee(amount) returns zero.' : rule;
      const implementation = scenario === 'unsupported_assertion' ? 'def fee(amount):\n    if amount < 0:\n        raise ValueError("Invalid amount")\n    return 0\n' : scenario === 'implementation_defect' ? code.replace('>=', '>') : code;
      const unrelated = 'Shipping fee amount threshold background notes.\n'.repeat(500);
      const root = await project(t, { 'source/shipping.py': implementation, 'source/notes.md': unrelated, 'source/contract.md': 'Only the submitted requirement defines the expected result.' });
      const r = report();
      r.rules = [{ id: 'R1', text: requirement }, { id: 'R2', text: 'The verification must not contact external services.' }];
      r.requirementInput = { mode: 'numbered', text: requirement, context: 'Amounts are expressed in integer cents.' };
      const candidate: PythonTest = { ...artifact, quote: requirement, code: scenario === 'unsupported_assertion' ? 'import pytest\nfrom shipping import fee\ndef test_threshold():\n    with pytest.raises(ValueError, match="Amount must be positive"):\n        fee(-1)\n' : scenario === 'bad_import' ? artifact.code.replace('from shipping', 'from invented_shipping') : artifact.code };
      let generations = 0, reviews = 0;
      let captured = 0;
      let initialContext: Record<string, unknown>;
      const sizes: Record<string, { beforeBytes: number; afterBytes: number }> = {};
      const ask: Reason = async (schema, task, rawContext) => {
        if (process.env.REQTEST_CONTEXT_CAPTURE_DIR) {
          const kind = Object.is(schema, analysisSchema) ? 'analysis' : Object.is(schema, testsSchema) ? 'generation' : Object.is(schema, reviewTestsSchema) ? 'review' : Object.is(schema, diagnosisSchema) ? 'diagnosis' : 'mutation';
          await mkdir(process.env.REQTEST_CONTEXT_CAPTURE_DIR, { recursive: true });
          await writeFile(join(process.env.REQTEST_CONTEXT_CAPTURE_DIR, `${scenario}-${++captured}-${kind}.json`), JSON.stringify({ task, context: rawContext }, null, 2));
        }
        const context = rawContext as { files: Record<string, string>; rules: typeof r.rules; requirementContext: string; retrievedDocuments: { file: string; text?: string }[]; analysis: Analysis; tests: PythonTest[]; failedTestIds: string[]; measurement: Measurement; phase: string; functions?: unknown; collection?: unknown };
        assert.deepEqual(context.rules, r.rules, 'Keep cross-requirement constraints in every stage.');
        assert.equal(context.requirementContext, r.requirementInput!.context);
        if (Object.is(schema, analysisSchema)) {
          initialContext = structuredClone(context);
          assert.equal(context.files['notes.md'], unrelated, 'Initial analysis retains the complete project context.');
          assert.ok(context.retrievedDocuments.some(document => document.file === 'notes.md'));
          assert.ok(context.retrievedDocuments.every(document => document.text === undefined), 'Document text occurs only in files.');
          const result = analysis();
          Object.assign(result.behaviors[0], { quote: requirement, issue: scenario === 'ambiguous_requirement' ? 'ambiguous' : 'none', reason: scenario === 'ambiguous_requirement' ? 'The word large specifies no threshold.' : 'Explicit contract', evidence: [{ file: 'shipping.py', quote: 'def fee(amount):' }, { file: 'contract.md', quote: 'Only the submitted requirement defines the expected result.' }] });
          return schema.parse(result);
        }
        if (Object.is(schema, testsSchema)) return schema.parse({ tests: [++generations === 2 && scenario === 'bad_import' ? artifact : candidate] });
        if (Object.is(schema, reviewTestsSchema) || Object.is(schema, diagnosisSchema)) {
          assert.equal(context.files['notes.md'], undefined, 'Unrelated documentation is not repeated in follow-up calls.');
          assert.equal(context.files['shipping.py'], implementation, 'Keep the whole mapped source file, not a misleading snippet.');
          assert.equal(context.files['contract.md'], 'Only the submitted requirement defines the expected result.');
          assert.equal(context.functions, undefined); assert.equal(context.collection, undefined);
          const legacy = { ...initialContext!, analysis: r.analysis, tests: context.tests, retrievedDocuments: context.retrievedDocuments.map(document => ({ ...document, text: (initialContext!.files as Record<string, string>)[document.file] })), ...(Object.is(schema, diagnosisSchema) ? { files: { ...(initialContext!.files as Record<string, string>), ...Object.fromEntries(r.tests.map(test => [`reqtest_generated/test_reqtest_${test.id}.py`, test.code])) }, tests: r.tests.map(test => ({ ...test, file: `reqtest_generated/test_reqtest_${test.id}.py` })), phase: context.phase, failedTestIds: context.failedTestIds, measurement: r.measurements.at(-1) } : {}) };
          const beforeBytes = Buffer.byteLength(JSON.stringify(legacy)), afterBytes = Buffer.byteLength(JSON.stringify(context));
          assert.ok(afterBytes < beforeBytes, 'Focused input is smaller without removing original requirements.');
          sizes[Object.is(schema, reviewTestsSchema) ? 'review' : 'diagnosis'] = { beforeBytes, afterBytes };
        }
        if (Object.is(schema, reviewTestsSchema)) {
          reviews++;
          return schema.parse(scenario === 'unsupported_assertion' || scenario === 'ambiguous_requirement' ? { decisions: [{ testId: 'T1', supported: false, quote: requirement, reason: scenario === 'unsupported_assertion' ? 'The original requirement specifies no exception message.' : 'The original requirement specifies no large-order threshold.' }] } : approval('T1'));
        }
        if (Object.is(schema, diagnosisSchema)) {
          assert.deepEqual(context.failedTestIds, ['T1']);
          const file = 'reqtest_generated/test_reqtest_T1.py';
          assert.equal(context.files[file], candidate.code, 'The failed generated code is supplied once under its real artifact path.');
          assert.equal(context.tests[0].code, undefined, 'Test metadata does not duplicate the generated file.');
          return schema.parse({ decisions: [{ testId: 'T1', category: scenario === 'bad_import' ? 'generated_test_error' : 'potential_implementation_defect', quote: requirement, reason: scenario === 'bad_import' ? 'The generated import names a nonexistent module.' : 'The implementation excludes the stated inclusive boundary.', executionQuote: scenario === 'bad_import' ? "ModuleNotFoundError: No module named 'invented_shipping'" : 'assert 1000 == 0', evidence: [{ file: 'shipping.py', quote: 'def fee(amount):' }, { file, quote: scenario === 'bad_import' ? 'from invented_shipping import fee' : 'assert fee(10000) == 0' }] }] });
        }
        if (Object.is(schema, relevanceSchema)) return schema.parse({ decisions: [] });
        throw new Error('Unexpected reasoning stage.');
      };
      await runPython(r, root, AbortSignal.timeout(45000), () => {}, ask);
      assert.equal(r.status, 'completed');
      assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), implementation);
      assert.ok(r.measurements.every(measurement => measurement.integrity));
      if (scenario === 'bad_import') {
        assert.equal(generations, 2); assert.equal(reviews, 2); assert.equal(r.improvements.length, 1);
        assert.equal(r.measurements[0].outcomes[0].status, 'error');
        assert.equal(r.measurements.at(-1)!.outcomes[0].status, 'passed');
        assert.equal(r.tests[0].code, artifact.code);
        assert.equal(r.improvements[0].before[0].code, candidate.code);
      } else if (scenario === 'implementation_defect') {
        assert.equal(generations, 1); assert.equal(r.improvements.length, 0);
        assert.equal(r.tests[0].code, candidate.code);
        assert.equal(r.measurements.at(-1)!.outcomes[0].status, 'failed');
        assert.equal(r.states[0].status, 'Uncertain');
      } else {
        assert.equal(generations, scenario === 'unsupported_assertion' ? 2 : 1);
        assert.equal(r.improvements.length, 0); assert.equal(r.tests[0].approved, false);
        assert.ok(r.measurements.every(measurement => measurement.outcomes.length === 0));
        assert.ok(r.states.every(state => state.status !== 'Verified'));
        await assert.rejects(access(join(root, 'generated/test_reqtest_T1.py')));
        assert.equal(r.testAttempts!.at(-1)!.status, 'rejected');
      }
      t.diagnostic(JSON.stringify({ scenario, contextSizes: sizes, modelCalls: 0 }));
    });
  }
});
