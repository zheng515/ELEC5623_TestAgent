import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { validateAnalysis, updateStates, runPython } from '../lib/python-agent';
import { importProject, measureProject, type Inspection } from '../lib/python-tools';
import { analysisSchema, groundedAnalysisSchema, diagnosisSchema, reviewTestsSchema, relevanceSchema, testsSchema, type PythonReport, type Measurement, type DiagnosisPhase } from '../lib/python-types';

const rule = 'For integer amount >= 10000, shipping.fee(amount) returns integer 0.';
const code = 'def fee(amount):\n    return 0 if amount >= 10000 else 1000\n';
function report(): PythonReport { return { id:'test', title:'Test', createdAt:new Date().toISOString(), model:'unused', source:'synthetic fixture', fingerprint:'test', status:'running', stage:'', rules:[{id:'R1',text:rule}], tests:[], measurements:[], mutations:[], diagnoses:[], relevance:[], improvements:[], states:[], limitations:[] }; }
function analysis() { return analysisSchema.parse({ behaviors:[{id:'B1',ruleId:'R1',quote:rule,text:'Exact threshold',category:'boundary',issue:'none',reason:'Explicit boundary',files:['shipping.py'],existingTests:[],evidence:[{file:'shipping.py',quote:'def fee(amount):'}],gaps:['No exact-threshold test']}],inconsistencies:[] }); }
const snapshot: Inspection = {files:{'shipping.py':code},functions:[],nodes:[],collection:{exitCode:5,log:''},errors:[]};
const artifact = {id:'T1',behaviorId:'B1',functionName:'test_threshold',gapIndexes:[0],quote:rule,purpose:'Exact threshold',code:'from shipping import fee\ndef test_threshold():\n    assert fee(10000) == 0\n',approved:true};

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
  a.behaviors[0].files=['README.md'];assert.equal(constrained.safeParse(a).success,false);
  a.behaviors[0].files=['shipping.py'];a.behaviors[0].existingTests=['tests/test_invented.py::test_x'];assert.equal(constrained.safeParse(a).success,false);
  a.behaviors[0].existingTests=[];a.behaviors[0].quote='A paraphrased rule';assert.equal(constrained.safeParse(a).success,false);
});
test('retains omitted requirements as explicit unresolved behaviors', () => {
  const omitted=analysisSchema.parse({behaviors:[],inconsistencies:[]});validateAnalysis(omitted,report(),snapshot);
  assert.equal(omitted.behaviors[0].issue,'not_testable');
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
      if(Object.is(schema,relevanceSchema)) return schema.parse({decisions:(context as {mutants:{id:string}[]}).mutants.map(mutant=>({mutantId:mutant.id,behaviorId:'B1',relevant:true,reason:'Threshold is explicitly inclusive.',quote:rule}))});
      throw new Error('Unexpected diagnosis for a passing fixture');
    };
    await runPython(r,root,new AbortController().signal,()=>{},ask);
    assert.ok(r.mutations[0].mutants.some(mutant=>mutant.status==='survived'));
    assert.ok(r.mutations.every(attempt=>attempt.mutants.every(mutant=>mutant.diff.trim())), 'Killed and surviving mutants must both retain reviewable differences');
    assert.equal(r.improvements.length,1);assert.equal(r.measurements.length,2);assert.equal(r.mutations.length,2);
    assert.equal(r.mutations[1].mutants.filter(mutant=>mutant.status==='survived').length,0);
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
