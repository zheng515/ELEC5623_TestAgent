import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import JSZip from 'jszip';
import { EventSourceParserStream } from 'eventsource-parser/stream';

test('authenticated real-model Python API detects a seeded defect and saves private evidence', {
  skip:process.env.REQTEST_PYTHON_LIVE_TEST!=='1', timeout:600000,
}, async()=>{
  const base=process.env.APP_URL || 'http://127.0.0.1:3001';
  const credentials={name:'Python integration',email:randomUUID()+'@example.test',password:'Aa1'+randomUUID()};
  const signup=await fetch(base+'/api/auth/sign-up/email',{method:'POST',headers:{'Content-Type':'application/json',Origin:base},body:JSON.stringify(credentials)});
  assert.equal(signup.status,200);
  await mkdir('.evidence',{recursive:true});
  await writeFile('.evidence/python-api-account.json',JSON.stringify(credentials),{mode:0o600});
  const cookie=signup.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');
  const zip=new JSZip();
  zip.file('shipping.py',(await readFile('examples/shipping/shipping.py','utf8')).replace('>= 10000','> 10000'));
  zip.file('tests/test_shipping.py',await readFile('examples/shipping/tests/test_shipping.py'));
  const form=new FormData();form.set('title','Seeded boundary defect');form.set('model','gpt-6-luna');
  form.set('requirements',(await readFile('examples/shipping/SRS.md','utf8')).split('\n').slice(0,2).join('\n'));
  form.set('project',new File([await zip.generateAsync({type:'uint8array'})],'shipping-bug.zip',{type:'application/zip'}));
  const response=await fetch(base+'/api/python',{method:'POST',headers:{Cookie:cookie,Origin:base},body:form,signal:AbortSignal.timeout(590000)});
  if(!response.ok) throw new Error((await response.text()).slice(0,200));
  let report;
  const stream=response.body.pipeThrough(new TextDecoderStream()).pipeThrough(new EventSourceParserStream());
  for await(const event of stream){const data=JSON.parse(event.data);if(event.event==='progress')console.log(data.stage);if(event.event==='complete')report=data;}
  await mkdir('.evidence',{recursive:true});
  await writeFile('.evidence/python-api-report.json',JSON.stringify(report,null,2));
  assert.equal(report.status,'completed',report.error);
  assert.ok(report.measurements.at(-1).outcomes.some(outcome=>outcome.status==='failed'));
  assert.ok(report.diagnoses.some(decision=>decision.category==='potential_implementation_defect'));
  assert.equal(report.improvements.length,0,'A valid failing defect test must not be repaired');
  const history=await fetch(base+'/api/python',{headers:{Cookie:cookie}}).then(response=>response.json());
  assert.ok(history.some(item=>item.id===report.id));
  // Local testing credentials only, kept private and excluded from Git.
  await writeFile('.evidence/python-api-account.json',JSON.stringify(credentials),{mode:0o600});
  console.log('Real API, seeded defect, diagnosis and authenticated history checked.');
});
