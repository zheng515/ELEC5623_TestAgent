import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import JSZip from 'jszip';
import { reviewTemplate, scoreReports, type Gold } from '../lib/evaluation';
import { probeFault } from '../lib/evaluation-tools';
import { importProject, measureProject, writeTests } from '../lib/python-tools';
import type { PythonReport } from '../lib/python-types';

const node = 'reqtest_generated/test_reqtest_T1.py::test_threshold';
const artifact = { id:'T1', behaviorId:'B1', functionName:'test_threshold', gapIndexes:[0], quote:'At 24 hours the fee is zero.', purpose:'Boundary', code:'from booking import cancellation_fee\ndef test_threshold():\n    assert cancellation_fee(24) == 0\n', approved:true };
function fixture() {
  const report: PythonReport = { id:'test', variant:'B3', title:'booking', createdAt:'2026-10-19', model:'test', source:'fixture', fingerprint:'fixed', status:'completed', stage:'Complete', rules:[{id:'R1',text:artifact.quote}], tests:[artifact], analysis:{behaviors:[{id:'B1',ruleId:'R1',quote:artifact.quote,text:'Boundary',category:'boundary',issue:'none',reason:'Explicit',files:['booking.py'],existingTests:[],evidence:[{file:'booking.py',quote:'def cancellation_fee(hours):'}],gaps:['No exact-boundary check']}],inconsistencies:[]}, measurements:[{outcomes:[{node,file:'reqtest_generated/test_reqtest_T1.py',name:'test_threshold',status:'passed',message:''}],exitCode:0,log:'',timedOut:false,integrity:true}], mutations:[], diagnoses:[], relevance:[], improvements:[], states:[{id:'B1',status:'Verified',reason:'Mapped case',nodes:[node]}], limitations:[] };
  const gold: Gold = { reviewed:true,reviewer:'Independent test fixture reviewer',issues:[],inconsistencies:[],behaviors:[{id:'threshold',ruleId:'R1',description:'Exactly 24 hours',initialGap:true},{id:'omitted',ruleId:'R1',description:'Another required case omitted by the agent',initialGap:true}] };
  const review = reviewTemplate(report,gold);review.reviewed=true;review.reviewer='Independent output fixture reviewer';review.validOutcome=true;review.gaps[0]={id:'B1:0',match:'threshold',evidenceSupported:true};review.coverage[0].beforeNodes=[node];review.coverage[0].afterNodes=[node];
  return {report,gold,review};
}
test('unreviewed outputs and missing reference review cannot manufacture accuracy',()=>{
  const item=fixture();item.review.reviewed=false;
  let result=scoreReports([item])[0];
  assert.equal(result.semanticCoverageAfter,null);assert.equal(result.gaps,null);assert.equal(result.pendingReviewRuns,1);
  item.review.reviewed=true;item.gold.reviewed=false;result=scoreReports([item])[0];
  assert.equal(result.diagnosisMacroF1,null);assert.equal(result.reviewedRuns,0);
});
test('bound reviews cannot be reused for another run, source or requirement set',()=>{
  for(const field of ['reportId','sourceFingerprint','requirementTexts'] as const){
    const item=fixture();
    if(field==='requirementTexts')item.review.requirementTexts=['Different contract.'];else item.review[field]='other';
    assert.throws(()=>scoreReports([item]),/different run/);
  }
});
test('coverage includes omitted reference behaviors and requires real passing nodes',()=>{
  const item=fixture();let result=scoreReports([item])[0];
  assert.equal(result.semanticCoverageAfter,0.5);assert.deepEqual(result.gaps,{tp:1,fp:0,fn:1,precision:1,recall:0.5,f1:2/3});
  item.report.measurements[0].outcomes[0].status='skipped';result=scoreReports([item])[0];assert.equal(result.semanticCoverageAfter,0);assert.equal(result.completedRunsWithExecution,0);assert.equal(result.unresolvedRunRate,1);
  item.review.coverage[0].afterNodes=['invented::test'];assert.throws(()=>scoreReports([item]),/missing executed/);
});
test('reviews cannot omit actual findings or invent reference matches',()=>{
  const item=fixture();item.review.gaps=[];assert.throws(()=>scoreReports([item]),/every real gaps/);
  item.review=reviewTemplate(item.report,item.gold);item.review.reviewed=true;item.review.reviewer='Reviewer';item.review.validOutcome=true;item.review.gaps[0].match='invented';item.review.gaps[0].evidenceSupported=true;
  assert.throws(()=>scoreReports([item]),/valid reference IDs/);
});
test('relevant non-equivalent mutation denominator excludes reviewed irrelevant/equivalent mutants',()=>{
  const item=fixture();item.report.mutations=[{incomplete:false,timedOut:false,log:'',mutants:['killed','survived','killed','killed'].map((status,i)=>({id:`Mutant #${i+1}`,file:'booking.py',line:1,status,diff:'fixture'}))}];
  item.review.mutants=item.report.mutations[0].mutants.map((mutant,i)=>({attempt:0,id:mutant.id,relevant:i!==2,equivalent:i===3}));
  assert.equal(scoreReports([item])[0].mutationScoreAfter,0.5);
  item.review.mutants[0].relevant=null;assert.equal(scoreReports([item])[0].mutationScoreAfter,null);item.review.mutants[0].relevant=true;
  item.report.mutations[0].mutants[0].diff='';assert.equal(scoreReports([item])[0].mutationScoreAfter,null);item.report.mutations[0].mutants[0].diff='fixture';
  item.report.mutations[0].mutants[1].status='unknown';assert.equal(scoreReports([item])[0].mutationScoreAfter,null);
});
test('incorrect repairs count weakened valid failures rather than trusting agent diagnoses',()=>{
  const item=fixture();item.report.measurements[0].outcomes[0].status='failed';
  item.report.improvements=[{reason:'Unsafe fixture repair',before:[artifact],after:[{...artifact,code:artifact.code.replace('== 0','== 2500')}]}];
  item.report.diagnoses=[{testId:'T1',category:'generated_test_error',quote:artifact.quote,reason:'Wrong fixture diagnosis',executionQuote:'failed',evidence:[]}];
  item.review=reviewTemplate(item.report,item.gold);item.review.reviewed=true;item.review.reviewer='Reviewer';item.review.validOutcome=false;item.review.gaps[0].evidenceSupported=true;
  item.review.diagnoses[0]={testId:'T1',expected:'potential_implementation_defect',evidenceSupported:false};
  const result=scoreReports([item])[0];assert.equal(result.incorrectRepairRate,1);assert.equal(result.diagnosisMacroF1,0);
});
test('diagnosis review separates collection and baseline records with the same failure ID',()=>{
  const item=fixture();
  item.report.collection={exitCode:2,log:'Missing dependency.'};
  item.report.baseline={outcomes:[],exitCode:2,log:'Missing dependency.',timedOut:false,integrity:true};
  item.report.measurements=[{outcomes:[],exitCode:5,log:'No selected tests.',timedOut:false,integrity:true}];
  const environment={testId:'environment',category:'environment_failure' as const,reason:'Missing dependency',quote:'',executionQuote:'Missing dependency.',evidence:[]};
  item.report.diagnoses=[{...environment,phase:'execution',category:'uncertain'},{...environment,phase:'collection'},{...environment,phase:'baseline'}];
  item.review=reviewTemplate(item.report,item.gold);item.review.reviewed=true;item.review.reviewer='Independent reviewer';item.review.validOutcome=true;
  item.review.gaps[0].evidenceSupported=true;
  for(const diagnosis of item.review.diagnoses){diagnosis.expected='environment_failure';diagnosis.evidenceSupported=true;}
  assert.deepEqual(item.review.diagnoses.map(item=>item.phase),['collection','baseline']);
  const result=scoreReports([item])[0];assert.equal(result.diagnosisMacroF1,1);assert.equal(result.nonTestFailures,0);
  item.review.diagnoses.pop();assert.throws(()=>scoreReports([item]),/Every collection, baseline/);
});
test('missing fault probes stay unavailable instead of disappearing from the denominator',()=>{
  const item=fixture();item.gold.fault={id:'boundary',file:'booking.py',before:'> 24',after:'>= 24'};
  const result=scoreReports([item])[0];assert.equal(result.faultCases,1);assert.equal(result.faultDetectionAfter,null);
});
test('real fault probe detects a preserved defect and detects its concealment after unsafe repair',{skip:process.env.REQTEST_DOCKER_TEST!=='1',timeout:60000},async()=>{
  const root=await mkdtemp(join(tmpdir(),'reqtest-fault-probe-'));
  try {
    const zip=new JSZip();zip.file('booking.py','def cancellation_fee(hours):\n    return 0 if hours > 24 else 2500\n');
    const archive=await zip.generateAsync({type:'nodebuffer'});const snapshot=await importProject(root,archive);await mkdir(join(root,'generated'));await writeTests(root,[artifact]);
    const item=fixture();item.gold.fault={id:'boundary',file:'booking.py',before:'hours > 24',after:'hours >= 24'};
    item.report.fingerprint=snapshot.fingerprint;item.report.measurements=[await measureProject(root,[],true,new AbortController().signal)];
    const changed={...artifact,code:artifact.code.replace('== 0','== 2500')};await writeTests(root,[changed]);
    item.report.tests=[changed];item.report.improvements=[{reason:'Unsafe fixture repair',before:[artifact],after:[changed]}];
    item.report.measurements.push(await measureProject(root,[],true,new AbortController().signal));
    const probe=await probeFault(root,archive,item.gold,item.report,new AbortController().signal);
    assert.equal(probe?.beforeDetected,true);assert.equal(probe?.afterDetected,false);
    assert.match(await readFile(join(root,'source/booking.py'),'utf8'),/hours > 24/);
  } finally {await rm(root,{recursive:true,force:true});}
});
