import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { execFileSync } from 'node:child_process';
import { asSchema } from 'ai';
import { validateAnalysis, updateStates, runPython, reviewSurvivingMutations, diagnosisTestId, type MutationReviewRequest } from '../lib/python-agent';
import { survivorReviews } from '../lib/mutation-review';
import { importProject, measureProject, mutateProject, dockerTool, type Inspection } from '../lib/python-tools';
import { analysisSchema, groundedAnalysisSchema, groundedTestsSchema, groundedDiagnosisSchema, originalQuoteSchema, diagnosisSchema, reviewTestsSchema, relevanceSchema, testsSchema, type PythonReport, type Measurement, type DiagnosisPhase } from '../lib/python-types';

const rule = 'For integer amount >= 10000, shipping.fee(amount) returns integer 0.';
const code = 'def fee(amount):\n    return 0 if amount >= 10000 else 1000\n';
function report(): PythonReport { return { id:'test', title:'Test', createdAt:new Date().toISOString(), model:'unused', source:'synthetic fixture', fingerprint:'test', status:'running', stage:'', rules:[{id:'R1',text:rule}], tests:[], measurements:[], mutations:[], diagnoses:[], relevance:[], improvements:[], states:[], limitations:[] }; }
function analysis() { return analysisSchema.parse({ behaviors:[{id:'B1',ruleId:'R1',quote:rule,text:'Exact threshold',category:'boundary',issue:'none',reason:'Explicit boundary',files:['shipping.py'],existingTests:[],evidence:[{file:'shipping.py',quote:'def fee(amount):'}],gaps:['No exact-threshold test']}],inconsistencies:[] }); }
const snapshot: Inspection = {files:{'shipping.py':code},functions:[],nodes:[],collection:{exitCode:5,log:''},errors:[]};
const artifact = {id:'T1',behaviorId:'B1',functionName:'test_threshold',gapIndexes:[0],quote:rule,purpose:'Exact threshold',code:'from shipping import fee\ndef test_threshold():\n    assert fee(10000) == 0\n',approved:true};

test('diagnosis provider schema accepts only requested canonical IDs and original quotes', async () => {
  const schema = groundedDiagnosisSchema(['T1', 'tests/test_original.py::test_fee', 'environment'], originalQuoteSchema(['', rule], ['', 'R1']));
  const provider = asSchema(schema);
  const decision = { testId: 'T1', category: 'generated_test_error', reason: 'Unsupported expected value.', quote: 'R1', executionQuote: 'assert 0 == 1', evidence: [] };
  const result = await provider.validate!({ decisions: [decision] });
  assert.equal(result.success, true);
  if (result.success) assert.equal(result.value.decisions[0].quote, rule);
  for (const testId of ['T999', 'test_threshold', 'reqtest_generated/test_reqtest_T1.py::test_threshold']) {
    assert.equal((await provider.validate!({ decisions: [{ ...decision, testId }] })).success, false);
  }
  assert.equal((await provider.validate!({ decisions: [{ ...decision, testId: 'environment', quote: '' }] })).success, true);
  assert.equal((await provider.validate!({ decisions: [{ ...decision, quote: 'Invented quote' }] })).success, false);
});

test('legacy diagnosis nodes map only through unique recorded generated failures', () => {
  const r = report(); r.tests = [artifact];
  const node = 'reqtest_generated/test_reqtest_T1.py::test_threshold[amount=10000]';
  const measurement: Measurement = { outcomes: [{ node, file: 'reqtest_generated/test_reqtest_T1.py', name: 'test_threshold[amount=10000]', status: 'failed', message: 'assert 0 == 1' }], exitCode: 1, log: '', timedOut: false, integrity: true };
  assert.equal(diagnosisTestId(node, ['T1'], r, measurement), 'T1');
  assert.equal(diagnosisTestId('environment', ['environment'], r, measurement), 'environment');
  assert.equal(diagnosisTestId('test_threshold', ['T1'], r, measurement), undefined);
  assert.equal(diagnosisTestId('reqtest_generated/test_reqtest_T1.py::test_threshold', ['T1'], r, measurement), undefined);
  measurement.outcomes[0].file = 'tests/test_original.py';
  assert.equal(diagnosisTestId(node, ['T1'], r, measurement), undefined);
  measurement.outcomes[0].file = 'reqtest_generated/test_reqtest_T1.py'; measurement.outcomes[0].status = 'passed';
  assert.equal(diagnosisTestId(node, ['T1'], r, measurement), undefined);
  measurement.outcomes[0].status = 'error';
  r.tests.push({ ...artifact, id: 'T2' });
  measurement.outcomes.push({ ...measurement.outcomes[0], file: 'reqtest_generated/test_reqtest_T2.py' });
  assert.equal(diagnosisTestId(node, ['T1', 'T2'], r, measurement), undefined, 'An ambiguous recorded alias cannot authorize a repair');
});

function mutationReport(count = 1) {
  const r = report(); r.analysis = analysis();
  r.mutations = [{ incomplete: false, timedOut: false, log: '', mutants: Array.from({ length: count }, (_, index) => ({ id: `Mutant #${index + 1}`, file: 'shipping.py', line: 2, status: 'survived', diff: `- >= 10000\n+ >= ${10001 + index}` })) }];
  return r;
}
const mutationDecision = (mutantId: string) => ({ mutantId, behaviorId: 'B1', relevant: true, quote: rule, reason: 'Changes the stated inclusive threshold.' });

test('survivor review batches all retained mutants and reuses only exact diff-bound decisions', async () => {
  const r = mutationReport(33), sizes: number[] = [];
  const review = async (mutants: PythonReport['mutations'][number]['mutants']) => {
    sizes.push(mutants.length); return { decisions: mutants.map(mutant => mutationDecision(mutant.id)) };
  };
  await reviewSurvivingMutations(r, review);
  assert.deepEqual(sizes, [16, 16, 1]); assert.equal(survivorReviews(r).filter(row => row.category === 'test_gap').length, 33);
  await reviewSurvivingMutations(r, review); assert.equal(sizes.length, 3);
  r.mutations[0].mutants[0].diff = '- >= 10000\n+ > 10000';
  r.mutations[0].mutants[1].status = 'killed';
  await reviewSurvivingMutations(r, review); assert.deepEqual(sizes, [16, 16, 1, 1]);
  assert.equal(survivorReviews(r).length, 32, 'Historical killed mutants must not appear in the current survivor summary');
});

test('missing, duplicate, unrelated-file and legacy mutation reviews stay unresolved', async () => {
  const r = mutationReport(5);
  r.analysis!.behaviors.push({ ...r.analysis!.behaviors[0], id: 'B2', files: ['other.py'] });
  r.mutations[0].mutants[4].diff = '';
  await reviewSurvivingMutations(r, async () => ({ decisions: [
    mutationDecision('Mutant #1'), mutationDecision('Mutant #1'),
    { ...mutationDecision('Mutant #2'), behaviorId: 'B2' },
    { ...mutationDecision('Mutant #3'), quote: 'Invented contract' }, mutationDecision('Mutant #999'),
  ] }));
  assert.ok(survivorReviews(r).every(row => row.category === 'unreviewed'));
  assert.ok(!r.relevance.some(decision => decision.mutantId === 'Mutant #999'));
  r.relevance = [{ ...mutationDecision('Mutant #4'), relevant: false, grounded: true }];
  assert.equal(survivorReviews(r)[3].category, 'unreviewed', 'Legacy decisions lack the exact mutation file and diff');
});

test('an irrelevant mutation decision cannot clear other behaviors in the same file', async () => {
  const r = mutationReport();
  r.analysis!.behaviors.push({ ...r.analysis!.behaviors[0], id: 'B2' });
  r.tests = [artifact, { ...artifact, id: 'T2', behaviorId: 'B2' }];
  r.measurements = [{ outcomes: r.tests.map(test => ({ node: `reqtest_generated/test_reqtest_${test.id}.py::test_threshold`, file: `reqtest_generated/test_reqtest_${test.id}.py`, name: test.functionName, status: 'passed', message: '' })), exitCode: 0, log: '', timedOut: false, integrity: true }];
  await reviewSurvivingMutations(r, async () => ({ decisions: [{ ...mutationDecision('Mutant #1'), relevant: false, reason: 'Outside B1 only.' }] }));
  updateStates(r);
  assert.equal(r.states.find(state => state.id === 'B1')?.status, 'Verified');
  assert.equal(r.states.find(state => state.id === 'B2')?.status, 'Partially Verified');
  assert.equal(survivorReviews(r)[0].category, 'unreviewed', 'B2 still lacks its own review');
  const retried: MutationReviewRequest[][] = [];
  await reviewSurvivingMutations(r, async (_mutants, _batch, requests) => { retried.push(requests); return { decisions: [] }; });
  assert.deepEqual(retried, [[{ mutantId: 'Mutant #1', behaviorId: 'B2' }]], 'Only the missing behavior is reviewed again');
  r.mutations[0].mutants[0].diff += '\nchanged'; updateStates(r);
  assert.equal(r.states[0].status, 'Partially Verified', 'A changed diff invalidates the old exclusion');
});

test('each behavior sharing a mutated file receives its own survivor review', async () => {
  const r = mutationReport();
  r.analysis!.behaviors.push({ ...r.analysis!.behaviors[0], id: 'B2' });
  r.tests = [artifact, { ...artifact, id: 'T2', behaviorId: 'B2' }];
  r.measurements = [{ outcomes: r.tests.map(test => ({ node: `reqtest_generated/test_reqtest_${test.id}.py::test_threshold`, file: `reqtest_generated/test_reqtest_${test.id}.py`, name: test.functionName, status: 'passed', message: '' })), exitCode: 0, log: '', timedOut: false, integrity: true }];
  const requests: MutationReviewRequest[][] = [];
  await reviewSurvivingMutations(r, async (_mutants, _batch, batch) => {
    requests.push(batch);
    return { decisions: batch.map(request => ({ ...mutationDecision(request.mutantId), behaviorId: request.behaviorId, relevant: false, reason: `Outside ${request.behaviorId}.` })) };
  });
  assert.deepEqual(requests, [[{ mutantId: 'Mutant #1', behaviorId: 'B1' }, { mutantId: 'Mutant #1', behaviorId: 'B2' }]]);
  updateStates(r);
  assert.deepEqual(r.states.map(state => state.status), ['Verified', 'Verified']);
  assert.equal(survivorReviews(r)[0].category, 'outside_behavior');
  await reviewSurvivingMutations(r, async () => { throw new Error('Resolved pairs must not be reviewed again'); });
  r.relevance.find(decision => decision.behaviorId === 'B2')!.relevant = true; updateStates(r);
  assert.deepEqual(r.states.map(state => state.status), ['Verified', 'Partially Verified'], 'A relevant survivor blocks only its own behavior');
  assert.equal(survivorReviews(r)[0].category, 'test_gap');
});

test('ambiguous mutation behavior requests clarification without inventing a test oracle', async () => {
  const r = mutationReport(); r.analysis!.behaviors[0].issue = 'ambiguous';
  await reviewSurvivingMutations(r, async () => ({ decisions: [mutationDecision('Mutant #1')] }));
  assert.equal(survivorReviews(r)[0].category, 'clarification');
  r.relevance[0].relevant = false;
  assert.equal(survivorReviews(r)[0].category, 'clarification', 'Ambiguous contracts cannot be treated as a resolved exclusion');
  updateStates(r); assert.equal(r.states[0].status, 'Uncertain');
});

test('timed-out tool commands stop their process group and retain readable partial output', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 15000 }, () => {
  const script = `import runpy,sys,time\nfrom pathlib import Path\ncommand=runpy.run_path('/tool/worker.py')['command']\nchild="import time;from pathlib import Path;time.sleep(0.8);Path('/tmp/leaked-child').write_text('leaked')"\nparent="import subprocess,sys,time;subprocess.Popen([sys.executable,'-c',"+repr(child)+"]);print('partial progress',flush=True);time.sleep(10)"\ncode,log,timed=command([sys.executable,'-c',parent],0.2)\nassert timed and code==-1 and 'partial progress' in log and 'process group was stopped' in log\ntime.sleep(1)\nassert not Path('/tmp/leaked-child').exists()\n`;
  execFileSync('docker', ['run', '--rm', '-i', '--network', 'none', '--read-only', '--tmpfs', '/work:rw,exec,size=32m,mode=1777', '--tmpfs', '/tmp:rw,exec,size=32m,mode=1777', '--entrypoint', 'python', process.env.REQTEST_SANDBOX_IMAGE || 'reqtest-python:1', '-'], { input: script, timeout: 12000 });
});

test('mutation scope follows approved direct calls and runs generated tests despite project testpaths', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-mutation-scope-'));
  try {
    await mkdir(join(root, 'source/tests'), { recursive: true }); await mkdir(join(root, 'generated'));
    await writeFile(join(root, 'source/business.py'), code + '\ndef unrelated(value):\n    return value + 12345\n');
    await writeFile(join(root, 'source/pyproject.toml'), '[tool.pytest.ini_options]\ntestpaths=["tests"]\n');
    await writeFile(join(root, 'source/tests/test_other_suite.py'), 'def test_other_suite():\n    assert False, "Wrong mutation suite"\n');
    await writeFile(join(root, 'generated/test_reqtest_T1.py'), 'from business import fee as shipping_fee\ndef test_above():\n    assert shipping_fee(20000) == 0\n');
    const result = await mutateProject(root, 'business.py', AbortSignal.timeout(40000));
    assert.equal(result.incomplete, false, result.log); assert.ok(result.mutants.length);
    assert.deepEqual(result.scope?.functions, ['fee']); assert.equal(result.scope?.suite, 'approved_generated');
    assert.ok(result.mutants.every(mutant => mutant.line <= 2 && mutant.diff.includes('business.py')));
    assert.ok(result.mutants.some(mutant => mutant.status === 'survived'));
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mutation time limits retain completed and untested cached outcomes without claiming completeness', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 40000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-mutation-budget-'));
  try {
    await mkdir(join(root, 'source')); await mkdir(join(root, 'generated'));
    await writeFile(join(root, 'source/business.py'), 'def calculate(value):\n' + '    value += 1\n'.repeat(80) + '    return value\n');
    await writeFile(join(root, 'generated/test_reqtest_T1.py'), 'import business as target\ndef test_total():\n    assert target.calculate(0) == 80\n');
    const result = await dockerTool<import('../lib/python-types').Mutation>(root, { action: 'mutate', file: 'business.py', seconds: 10 }, AbortSignal.timeout(35000));
    assert.equal(result.timedOut, true); assert.equal(result.incomplete, true);
    assert.ok(result.mutants.some(mutant => mutant.status === 'killed'), result.log);
    assert.ok(result.mutants.some(mutant => mutant.status === 'unknown'));
    assert.ok(result.mutants.every(mutant => mutant.diff.trim()));
    assert.match(result.log, /process group was stopped/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mutation collection retains existing conftest helper paths while deselecting existing assertions', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 45000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'reqtest-mutation-setup-'));
  try {
    await mkdir(join(root, 'source/tests'), { recursive: true }); await mkdir(join(root, 'generated'));
    await writeFile(join(root, 'source/shipping.py'), code);
    await writeFile(join(root, 'source/tests/conftest.py'), 'import sys\nfrom pathlib import Path\nsys.path.insert(0, str(Path(__file__).parent))\n');
    await writeFile(join(root, 'source/tests/local_support.py'), 'AMOUNT = 20000\n');
    await writeFile(join(root, 'source/tests/test_existing.py'), 'def test_existing():\n    assert False, "Existing assertions must be deselected"\n');
    await writeFile(join(root, 'generated/test_reqtest_T1.py'), 'from local_support import AMOUNT\nfrom shipping import fee\ndef test_above():\n    assert fee(AMOUNT) == 0\n');
    const result = await mutateProject(root, 'shipping.py', AbortSignal.timeout(40000), undefined, undefined, ['tests/test_existing.py::test_existing']);
    assert.equal(result.incomplete, false, result.log);
    assert.ok(result.mutants.some(mutant => mutant.status === 'killed'));
    assert.ok(result.mutants.some(mutant => mutant.status === 'survived'));
    assert.deepEqual(result.scope?.setupFiles, ['tests/conftest.py']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('gap text drops only a prefix that repeats its own list position', () => {
  const a = analysis(); a.behaviors[0].gaps = ['0: Check zero.', '[1] Check one.', 'Gap 2) Check two.', '7: Check a mismatched label.', '4:'];
  validateAnalysis(a, report(), snapshot);
  assert.deepEqual(a.behaviors[0].gaps, ['Check zero.', 'Check one.', 'Check two.', '7: Check a mismatched label.', '4:']);
});

test('rejects invented source quotes and unknown test links', () => {
  const invalid=analysis();invalid.behaviors[0].evidence[0].quote='invented';
  assert.throws(()=>validateAnalysis(invalid,report(),snapshot),/unsupported/);
  const unknown=analysis();unknown.behaviors[0].existingTests=['tests/test_fake.py::test_x'];
  assert.throws(()=>validateAnalysis(unknown,report(),snapshot),/unknown/);
});
test('generation schema keeps documentation evidence separate from implementation and collected test links', () => {
  const constrained=groundedAnalysisSchema({...snapshot.files,'README.md':'Shipping documentation'},['tests/test_shipping.py::test_standard'],[rule]);
  const a=analysis();a.behaviors[0].evidence.push({file:'README.md',quote:'Shipping documentation'});
  assert.equal(constrained.safeParse(a).success,true);
  const unsupported = structuredClone(a); unsupported.behaviors[0].evidence = [];
  assert.equal(constrained.safeParse(unsupported).success, false, 'Code links must include evidence at generation time');
  unsupported.behaviors[0].files = []; unsupported.behaviors[0].existingTests = [];
  assert.equal(constrained.safeParse(unsupported).success, true, 'Unlinked requirements may remain unresolved');
  a.behaviors[0].files=['README.md'];assert.equal(constrained.safeParse(a).success,false);
  a.behaviors[0].files=['shipping.py'];a.behaviors[0].existingTests=['tests/test_invented.py::test_x'];assert.equal(constrained.safeParse(a).success,false);
  a.behaviors[0].existingTests=[];a.behaviors[0].quote='A paraphrased rule';assert.equal(constrained.safeParse(a).success,false);
});
test('multiline document quotes produce compatible provider schemas while exact originals remain mandatory', async () => {
  const original = 'FR-CAL-03\nThe supplied offset is discarded.\nUse Sydney daylight saving rules.';
  const schema = groundedAnalysisSchema(snapshot.files, [], [original], ['R1']);
  const provider = asSchema(schema);
  const json = provider.jsonSchema;
  assert.ok(!JSON.stringify(json).includes(original.replaceAll('\n', '\\n')), 'Original multiline text must not be embedded in provider enums');
  const a = analysis(); a.behaviors[0].quote = 'R1';
  const accepted = await provider.validate!(a);
  assert.equal(accepted.success, true);
  if (accepted.success) assert.equal(accepted.value.behaviors[0].quote, original);
  a.behaviors[0].quote = original.replaceAll('\n', ' ');
  assert.equal((await provider.validate!(a)).success, false, 'Whitespace rewriting does not preserve the original quote');
  const quote = originalQuoteSchema(['', original], ['', 'R1']);
  assert.equal(quote.safeParse('').success, true, 'Environment diagnosis may have no requirement quote');
  assert.equal(quote.parse('R1'), original);
  assert.equal(quote.safeParse('invented').success, false);
});
test('retains omitted requirements as explicit unresolved behaviors', () => {
  const omitted=analysisSchema.parse({behaviors:[],inconsistencies:[]});validateAnalysis(omitted,report(),snapshot);
  assert.equal(omitted.behaviors[0].issue,'not_testable');
});
test('generated gap indexes are bound to their own behavior rather than global numbering', async () => {
  const schema = groundedTestsSchema([{ id: 'B3', gaps: ['[2] Check the week boundary.'] }, { id: 'B8', gaps: ['[7] Check the local date.', 'Check the offset.'] }], originalQuoteSchema([rule]));
  const provider = asSchema(schema), test = { ...artifact, behaviorId: 'B3' };
  assert.equal((await provider.validate!({ tests: [test] })).success, true);
  assert.equal((await provider.validate!({ tests: [{ ...test, gapIndexes: [2] }] })).success, false);
  assert.equal((await provider.validate!({ tests: [{ ...test, behaviorId: 'B8', gapIndexes: [1] }] })).success, true);
  assert.equal((await provider.validate!({ tests: [{ ...test, behaviorId: 'B99' }] })).success, false);
  assert.ok(provider.jsonSchema);
});
test('inconsistencies must name affected behaviors and do not taint unrelated behaviors', () => {
  const r=report(), a=analysis();
  a.behaviors.push({...a.behaviors[0],id:'B2',text:'Other behavior'});
  a.inconsistencies.push({ruleId:'R1',behaviorIds:['B1'],quote:rule,description:'Threshold conflict',evidence:[{file:'shipping.py',quote:'def fee(amount):'}]});
  validateAnalysis(a,r,snapshot);r.analysis=a;updateStates(r);
  assert.equal(r.states.find(state=>state.id==='B1')?.status,'Uncertain');
  assert.equal(r.states.find(state=>state.id==='B2')?.status,'Unverified');
  a.inconsistencies[0].behaviorIds=['B999'];
  assert.throws(()=>validateAnalysis(a,r,snapshot),/unknown or unrelated behavior/);
});
test('unexecuted or unrelated-file tests cannot earn Verified', () => {
  const r=report();r.analysis=analysis();r.tests=[artifact];updateStates(r);assert.equal(r.states[0].status,'Unverified');
  r.measurements=[{outcomes:[{node:'other::test_threshold',file:'wrong.py',name:'test_threshold',status:'passed',message:''}],exitCode:0,log:'',timedOut:false,integrity:true}];updateStates(r);assert.equal(r.states[0].status,'Unverified');
});
test('a generated module loading failure makes its behavior uncertain without counting as a named check', () => {
  const r=report();r.analysis=analysis();r.tests=[artifact];
  r.measurements=[{outcomes:[{node:'reqtest_generated/test_reqtest_T1.py::<module>',file:'reqtest_generated/test_reqtest_T1.py',name:'<module>',status:'error',message:'Module import failed'}],exitCode:1,log:'Module import failed',timedOut:false,integrity:true}];
  updateStates(r);assert.equal(r.states[0].status,'Uncertain');
  r.measurements[0].outcomes[0].status='passed';updateStates(r);assert.equal(r.states[0].status,'Unverified');
});
test('missing gap checks, mutations and failures prevent unsupported verification', () => {
  const r=report();r.analysis=analysis();r.tests=[artifact];r.measurements=[{outcomes:[{node:'reqtest_generated/test_reqtest_T1.py::test_threshold',file:'reqtest_generated/test_reqtest_T1.py',name:'test_threshold',status:'passed',message:''}],exitCode:0,log:'',timedOut:false,integrity:true}];
  updateStates(r);assert.equal(r.states[0].status,'Verified');
  r.analysis.behaviors[0].gaps.push('Above threshold');updateStates(r);assert.equal(r.states[0].status,'Partially Verified');
  r.analysis.behaviors[0].gaps.pop();r.mutations=[{mutants:[],incomplete:true,log:'timeout',timedOut:true}];updateStates(r);assert.equal(r.states[0].status,'Partially Verified');
  r.measurements[0].outcomes[0].status='failed';updateStates(r);assert.equal(r.states[0].status,'Uncertain');
});
test('a collection timeout keeps a passing selected case uncertain', () => {
  const r=report();r.analysis=analysis();r.tests=[artifact];r.collection={exitCode:-1,log:'Collection timed out.',timedOut:true};
  r.measurements=[{outcomes:[{node:'reqtest_generated/test_reqtest_T1.py::test_threshold',file:'reqtest_generated/test_reqtest_T1.py',name:'test_threshold',status:'passed',message:''}],exitCode:0,log:'',timedOut:false,integrity:true}];
  updateStates(r);assert.equal(r.states[0].status,'Uncertain');
});
test('ZIP traversal and expanded-size limits are rejected', async () => {
  const root=await mkdtemp(join(tmpdir(),'reqtest-zip-'));
  try {
    const zip=new JSZip();zip.file('../escape.py','pass');await assert.rejects(importProject(root,await zip.generateAsync({type:'nodebuffer'})),/Unsafe/);
    const large=new JSZip();large.file('big.py','x'.repeat(200001));await assert.rejects(importProject(root,await large.generateAsync({type:'nodebuffer'})),/exceeds/);
  } finally {await rm(root,{recursive:true,force:true});}
});
test('real Docker pytest keeps a genuine defect and never repairs it', {skip:process.env.REQTEST_DOCKER_TEST!=='1',timeout:120000}, async () => {
  const root=await mkdtemp(join(tmpdir(),'reqtest-defect-'));
  try {
    await mkdir(join(root,'source'),{recursive:true});await mkdir(join(root,'generated'));
    await writeFile(join(root,'source/shipping.py'),code.replace('>= 10000','> 10000'));
    const r=report();
    const ask: typeof import('../lib/python-agent').reason = async (schema) => {
      if(Object.is(schema,analysisSchema)) return schema.parse(analysis());
      if(Object.is(schema,testsSchema)) return schema.parse({tests:[artifact]});
      if(Object.is(schema,reviewTestsSchema)) return schema.parse({decisions:[{testId:'T1',supported:true,reason:'Exact contract',quote:rule}]});
      if(Object.is(schema,diagnosisSchema)) return schema.parse({decisions:[{testId:'T1',category:'potential_implementation_defect',reason:'Boundary returns 1000 instead of 0 in the recorded assertion.',quote:rule,executionQuote:'assert 1000 == 0',evidence:[{file:'shipping.py',quote:'> 10000'},{file:'reqtest_generated/test_reqtest_T1.py',quote:'assert fee(10000) == 0'}]}]});
      throw new Error('Unexpected refinement');
    };
    await runPython(r,root,new AbortController().signal,()=>{},ask);
    assert.equal(r.status,'completed');assert.equal(r.measurements[0].outcomes[0].status,'failed');assert.equal(r.diagnoses[0].category,'potential_implementation_defect');assert.equal(r.improvements.length,0);assert.equal(r.states[0].status,'Uncertain');
  } finally {await rm(root,{recursive:true,force:true});}
});

test('one bounded retry can replace a blocked unexecuted proposal without bypassing its second review', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 60000 }, async () => {
  for (const accepted of [true, false]) {
    const root = await mkdtemp(join(tmpdir(), 'reqtest-blocked-gap-'));
    try {
      await mkdir(join(root, 'source')); await mkdir(join(root, 'generated'));
      await writeFile(join(root, 'source/shipping.py'), code);
      const r = report(); let generation = 0, reviews = 0;
      r.requirementInput = { mode: 'numbered', text: rule, context: 'Supporting environment: Python 3.11.' };
      const ask: typeof import('../lib/python-agent').reason = async (schema, _task, context) => {
        assert.equal((context as { requirementContext: string }).requirementContext, r.requirementInput!.context);
        if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
        if (Object.is(schema, testsSchema)) return schema.parse({ tests: [{ ...artifact, code: generation++ ? artifact.code : artifact.code.replace('== 0', '== 1') }] });
        if (Object.is(schema, reviewTestsSchema)) return schema.parse({ decisions: [{ testId: 'T1', supported: reviews++ > 0 && accepted, quote: rule, reason: 'Check only the explicitly required expected value.' }] });
        throw new Error('Unexpected extra action');
      };
      await runPython(r, root, AbortSignal.timeout(30000), () => {}, ask);
      assert.equal(generation, 2); assert.equal(reviews, 2);
      assert.equal(r.measurements[0].outcomes.length, 0, 'The rejected assertion must never execute.');
      assert.equal(r.improvements.length, accepted ? 1 : 0);
      assert.equal(r.tests[0].approved, accepted);
      if (accepted) {
        assert.equal(r.measurements.at(-1)!.outcomes[0].status, 'passed');
        assert.ok(r.improvements[0].before[0].code.includes('== 1'));
        assert.ok(r.tests[0].code.includes('== 0'));
      } else assert.equal(r.measurements.length, 1, 'No third proposal or unreviewed execution.');
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('recorded diagnosis aliases enable one grounded repair but duplicates and unsupported evidence do not', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 180000 }, async () => {
  for (const mode of ['valid', 'duplicate', 'unsupported'] as const) {
    const root = await mkdtemp(join(tmpdir(), 'reqtest-diagnosis-id-'));
    try {
      await mkdir(join(root, 'source')); await mkdir(join(root, 'generated'));
      await writeFile(join(root, 'source/shipping.py'), code);
      const r = report(); let generation = 0;
      const bad = { ...artifact, code: artifact.code.replace('== 0', '== 1') };
      const ask: typeof import('../lib/python-agent').reason = async (schema, _task, context) => {
        if (Object.is(schema, analysisSchema)) return schema.parse(analysis());
        if (Object.is(schema, testsSchema)) return schema.parse({ tests: [generation++ ? artifact : bad] });
        if (Object.is(schema, reviewTestsSchema)) return schema.parse({ decisions: [{ testId: 'T1', supported: true, reason: 'Replay a false initial approval, followed by grounded replacement review.', quote: rule }] });
        if (Object.is(schema, diagnosisSchema)) {
          const { measurement, failedTestIds } = context as { measurement: Measurement; failedTestIds: string[] };
          assert.deepEqual(failedTestIds, ['T1']);
          const node = measurement.outcomes.find(outcome => outcome.status === 'failed')!.node;
          const decision = { testId: node, category: 'generated_test_error', reason: 'The generated test expects 1, while the original contract explicitly requires 0.', quote: rule, executionQuote: 'assert 0 == 1', evidence: [{ file: 'shipping.py', quote: 'return 0 if amount >= 10000 else 1000' }, { file: 'reqtest_generated/test_reqtest_T1.py', quote: mode === 'unsupported' ? 'invented assertion' : 'assert fee(10000) == 1' }] };
          return schema.parse({ decisions: mode === 'duplicate' ? [decision, { ...decision, testId: 'T1' }] : [decision] });
        }
        if (Object.is(schema, relevanceSchema)) return schema.parse({ decisions: (context as { requests: MutationReviewRequest[] }).requests.map(request => ({ ...request, relevant: false, reason: 'The fixture only checks that repaired tests are mutation-tested.', quote: rule })) });
        throw new Error('Unexpected mutation or refinement stage');
      };
      await runPython(r, root, new AbortController().signal, () => {}, ask);
      assert.equal(r.diagnoses[0].testId, 'T1');
      assert.match(r.proposedDiagnoses![0].testId, /^reqtest_generated\//, 'Retain the original model ID for audit');
      assert.equal(r.improvements.length, mode === 'valid' ? 1 : 0);
      assert.equal(r.diagnoses[0].category, mode === 'valid' ? 'generated_test_error' : 'uncertain');
      assert.equal(r.measurements.at(-1)!.outcomes[0].status, mode === 'valid' ? 'passed' : 'failed');
      assert.equal(r.mutations.length, mode === 'valid' ? 1 : 0, 'A repaired passing suite is mutation-tested before it can earn Verified');
      assert.ok(r.measurements.every(measurement => measurement.integrity));
      assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), code);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

test('collection and baseline dependency errors are diagnosed even with no generated tests', {skip:process.env.REQTEST_DOCKER_TEST!=='1',timeout:60000}, async () => {
  const root=await mkdtemp(join(tmpdir(),'reqtest-missing-dependency-'));
  try {
    await mkdir(join(root,'source/tests'),{recursive:true});await mkdir(join(root,'generated'));
    await writeFile(join(root,'source/shipping.py'),code);
    await writeFile(join(root,'source/tests/test_missing.py'),'import reqtest_missing_dependency\n');
    const r=report();
    const ask: typeof import('../lib/python-agent').reason = async (schema, _task, context) => {
      if(Object.is(schema,analysisSchema)) return schema.parse(analysis());
      if(Object.is(schema,testsSchema)) {
        assert.ok(r.diagnoses.some(item=>item.phase==='collection'));
        assert.ok(r.diagnoses.some(item=>item.phase==='baseline'));
        return schema.parse({tests:[]});
      }
      if(Object.is(schema,diagnosisSchema)) {
        const evidence=context as {phase:DiagnosisPhase;failedTestIds:string[];measurement:Measurement};
        assert.ok(['collection','baseline'].includes(evidence.phase));
        const executionQuote="ModuleNotFoundError: No module named 'reqtest_missing_dependency'";
        assert.ok(evidence.measurement.log.includes(executionQuote));
        return schema.parse({decisions:evidence.failedTestIds.map(testId=>({testId,category:'environment_failure',reason:'The sandbox is missing a dependency required by existing tests.',quote:'',executionQuote,evidence:[{file:'tests/test_missing.py',quote:'import reqtest_missing_dependency'}]}))});
      }
      throw new Error('Unexpected repair or mutation action');
    };
    await runPython(r,root,new AbortController().signal,()=>{},ask);
    assert.equal(r.collection?.exitCode,2);assert.equal(r.baseline?.exitCode,2);assert.equal(r.measurements[0].exitCode,5);
    assert.equal(r.diagnoses.length,2);assert.ok(r.diagnoses.every(item=>item.category==='environment_failure'&&item.executionQuote));
    assert.equal(r.tests.length,0);assert.equal(r.improvements.length,0);assert.equal(r.states[0].status,'Uncertain');
    assert.equal(await readFile(join(root,'source/shipping.py'),'utf8'),code);
    await writeFile(join(root, 'generated/test_reqtest_T1.py'), 'import sqlite3\ndef test_runtime_database():\n    with sqlite3.connect("users.db") as connection:\n        connection.execute("CREATE TABLE users (id INTEGER)")\n');
    const runtime = await measureProject(root, [], true, new AbortController().signal);
    assert.equal(runtime.integrity, true); assert.equal(runtime.outcomes[0].status, 'passed');
    assert.equal(runtime.runtimeArtifacts?.[0].file, 'users.db'); assert.match(runtime.runtimeArtifacts![0].sha256, /^[a-f0-9]{64}$/);
    await writeFile(join(root, 'generated/test_reqtest_T1.py'), 'from pathlib import Path\ndef test_unexpected_output():\n    Path("fake.db").write_text("not a SQLite database")\n');
    const unexpected = await measureProject(root, [], true, new AbortController().signal);
    assert.equal(unexpected.integrity, false); assert.deepEqual(unexpected.runtimeArtifacts, []);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('existing assertion failures retain baseline and execution diagnoses without authorizing repair', {skip:process.env.REQTEST_DOCKER_TEST!=='1',timeout:60000}, async () => {
  const root=await mkdtemp(join(tmpdir(),'reqtest-baseline-failure-'));
  try {
    await mkdir(join(root,'source/tests'),{recursive:true});await mkdir(join(root,'generated'));
    await writeFile(join(root,'source/shipping.py'),code.replace('>= 10000','> 10000'));
    const testCode='from shipping import fee\ndef test_threshold():\n    assert fee(10000) == 0\n';
    await writeFile(join(root,'source/tests/test_existing.py'),testCode);
    const r=report();
    const ask: typeof import('../lib/python-agent').reason = async (schema, _task, context) => {
      if(Object.is(schema,analysisSchema)) { const a=analysis();a.behaviors[0].existingTests=['tests/test_existing.py::test_threshold'];a.behaviors[0].evidence.push({file:'tests/test_existing.py',quote:'assert fee(10000) == 0'});return schema.parse(a); }
      if(Object.is(schema,testsSchema)) return schema.parse({tests:[]});
      if(Object.is(schema,diagnosisSchema)) return schema.parse({decisions:(context as {failedTestIds:string[]}).failedTestIds.map(testId=>({testId,category:'potential_implementation_defect',reason:'The implementation excludes the required exact threshold.',quote:rule,executionQuote:'assert 1000 == 0',evidence:[{file:'shipping.py',quote:'> 10000'},{file:'tests/test_existing.py',quote:'assert fee(10000) == 0'}]}))});
      throw new Error('Existing tests must not be repaired');
    };
    await runPython(r,root,new AbortController().signal,()=>{},ask);
    assert.equal(r.collection?.exitCode,0);assert.equal(r.baseline?.outcomes[0].status,'failed');
    assert.deepEqual(r.diagnoses.map(item=>item.phase),['baseline','execution']);
    assert.ok(r.diagnoses.every(item=>item.category==='potential_implementation_defect'));
    assert.equal(r.improvements.length,0);assert.equal(r.states[0].status,'Uncertain');
    assert.equal(await readFile(join(root,'source/tests/test_existing.py'),'utf8'),testCode);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('real mutmut survivors trigger one targeted improvement and re-measurement', {skip:process.env.REQTEST_DOCKER_TEST!=='1',timeout:180000}, async () => {
  const root=await mkdtemp(join(tmpdir(),'reqtest-mutation-'));
  try {
    await mkdir(join(root,'source'),{recursive:true});await mkdir(join(root,'generated'));
    await writeFile(join(root,'source/shipping.py'),code);
    await writeFile(join(root,'source/README.md'),'Shipping fee API: import fee from shipping.');
    await mkdir(join(root,'source/tests'));
    await writeFile(join(root,'source/tests/test_shipping.py'),'from shipping import fee\ndef test_standard():\n    assert fee(0) == 1000\n');
    const r=report();let generation=0;
    const ask: typeof import('../lib/python-agent').reason = async (schema, _task, context) => {
      if(Object.is(schema,analysisSchema)) return schema.parse(analysis());
      if(Object.is(schema,testsSchema)) {
        generation++;
        return schema.parse({tests:generation===1 ? [{...artifact,gapIndexes:[],functionName:'test_above',code:'from shipping import fee\ndef test_above():\n    assert fee(20000) == 0\n'}] : [{...artifact,id:'T2'}]});
      }
      if(Object.is(schema,reviewTestsSchema)) return schema.parse({decisions:(context as {tests:{id:string}[]}).tests.map(test=>({testId:test.id,supported:true,reason:'Exact contract',quote:rule}))});
      if(Object.is(schema,relevanceSchema)) return schema.parse({decisions:(context as {mutants:{id:string;diff:string}[]}).mutants.map(mutant=>({mutantId:mutant.id,behaviorId:'B1',relevant:/\+.*(?:amount > 10000|amount >= 10001)/.test(mutant.diff),reason:'Boundary mutations can violate the inclusive threshold; changing the below-threshold fee does not change the stated >=10000 contract.',quote:rule}))});
      throw new Error('Unexpected diagnosis for a passing fixture');
    };
    await runPython(r,root,new AbortController().signal,()=>{},ask);
    assert.ok(r.mutations[0].mutants.some(mutant=>mutant.status==='survived'));
    assert.ok(r.mutations.every(attempt=>attempt.mutants.every(mutant=>mutant.diff.trim())), 'Killed and surviving mutants must both retain reviewable differences');
    assert.equal(r.improvements.length,1);assert.equal(r.measurements.length,2);assert.equal(r.mutations.length,2);
    const boundaries = r.mutations[0].mutants.filter(mutant => mutant.status === 'survived' && /\+.*(?:amount > 10000|amount >= 10001)/.test(mutant.diff));
    assert.ok(boundaries.length);
    assert.ok(boundaries.every(before => r.mutations[1].mutants.some(after => after.id === before.id && after.status === 'killed')));
    assert.deepEqual(r.mutations[0].scope, r.mutations[1].scope, 'Re-measurement preserves the selected file and functions');
    assert.equal(r.tests.length,2);assert.equal(r.states[0].status,'Verified');
    assert.equal(r.initialStates?.[0].status,'Partially Verified');
    assert.equal(r.retrieval?.documents[0].file,'README.md');
    assert.equal(r.retrieval?.documents[0].text,'Shipping fee API: import fee from shipping.');
    assert.match(r.retrieval!.documents[0].sha256,/^[a-f0-9]{64}$/);
  } finally {await rm(root,{recursive:true,force:true});}
});

test('sandbox evidence detects generated-code tampering and preserves original mounts', {skip:process.env.REQTEST_DOCKER_TEST!=='1',timeout:30000}, async()=>{
  const root=await mkdtemp(join(tmpdir(),'reqtest-integrity-'));
  try{
    await mkdir(join(root,'source'));await mkdir(join(root,'generated'));
    await writeFile(join(root,'source/shipping.py'),code);
    const tampering='from pathlib import Path\ndef test_tamper():\n    Path(__file__).write_text("# changed")\n    assert True\n';
    await writeFile(join(root,'generated/test_reqtest_T1.py'),tampering);
    const measurement=await measureProject(root,[],true,new AbortController().signal);
    assert.equal(measurement.outcomes[0].status,'passed');assert.equal(measurement.integrity,false);
    assert.equal(await readFile(join(root,'generated/test_reqtest_T1.py'),'utf8'),tampering);
    assert.equal(await readFile(join(root,'source/shipping.py'),'utf8'),code);
  }finally{await rm(root,{recursive:true,force:true});}
});

test('one analysis correction preserves the rejected response and cannot bypass evidence validation', { skip: process.env.REQTEST_DOCKER_TEST !== '1', timeout: 30000 }, async () => {
  for (const corrected of [true, false]) {
    const root = await mkdtemp(join(tmpdir(), 'reqtest-analysis-correction-'));
    let calls = 0;
    try {
      await mkdir(join(root, 'generated'));
      const zip = new JSZip(); zip.file('shipping.py', code);
      await importProject(root, await zip.generateAsync({ type: 'nodebuffer' }));
      const r = report();
      const ask = (async (schema) => {
        if (Object.is(schema, analysisSchema)) {
          const next = analysis(); calls++;
          if (calls === 1 || !corrected) next.behaviors[0].evidence[0].quote = code.replaceAll('\n', '\\n');
          return schema.parse(next);
        }
        if (Object.is(schema, testsSchema)) return schema.parse({ tests: [] });
        throw new Error('Unexpected reasoning stage.');
      }) as typeof import('../lib/python-agent').reason;
      const run = () => runPython(r, root, AbortSignal.timeout(12000), () => {}, ask);
      if (corrected) {
        await run(); assert.equal(r.status, 'completed');
        assert.equal(r.analysis!.behaviors[0].evidence[0].quote, 'def fee(amount):');
      } else await assert.rejects(run, /unsupported/);
      assert.equal(calls, 2, 'Only one correction request is allowed');
      assert.match(r.analysisCorrection!.error, /unsupported/);
      assert.equal(r.analysisCorrection!.original.behaviors[0].evidence[0].quote, code.replaceAll('\n', '\\n'));
      assert.equal(await readFile(join(root, 'source/shipping.py'), 'utf8'), code);
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});
