import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { authFixture, cookies } from './fixtures/auth';

test('real registration, password verification, protected routes and per-user report ownership', async (context) => {
  const { auth, database, dataDir, session, base, call } = await authFixture(context, 'account');
  const invalidPasswords = [
    { password: 'Abc1234', rule: /8–128 characters/ },
    { password: 'Aa1' + 'x'.repeat(126), rule: /8–128 characters/ },
    { password: 'abcdefgh1', rule: /uppercase/ },
    { password: 'ABCDEFGH1', rule: /lowercase/ },
    { password: 'Abcdefgh', rule: /number/ },
  ];
  for (const [index, sample] of invalidPasswords.entries()) {
    const rejected = await call('sign-up/email', { name: 'Invalid password', email: randomUUID() + '@example.test', password: sample.password }, '', `192.0.2.${index + 1}`);
    assert.equal(rejected.status, 400);
    const error = await rejected.json();
    assert.equal(error.code, 'INVALID_PASSWORD');
    assert.match(error.message, sample.rule);
  }
  assert.equal((await database.query('SELECT count(*) FROM "user"')).rows[0].count, '0', 'Rejected registrations must not create accounts');
  const email = randomUUID() + '@example.test', password = 'Abcd1234';
  const signup = await call('sign-up/email', { name: 'Test account', email, password });
  assert.equal(signup.status, 200);
  const user = (await signup.json()).user;
  const cookie = cookies(signup);
  assert.ok(cookie.includes('session_token'));
  assert.equal((await session(new Request(base, { headers: { Cookie: cookie } })))?.user.id, user.id);
  assert.equal((await call('sign-in/email', { email, password: 'wrong-password' })).status, 401);
  assert.equal((await call('sign-in/email', { email, password })).status, 200);
  assert.notEqual((await database.query('SELECT password FROM account WHERE "userId"=$1', [user.id])).rows[0].password, password);
  const weakChange = await call('change-password', { currentPassword: password, newPassword: 'weakpassword' }, cookie);
  assert.equal(weakChange.status, 400);
  assert.equal((await weakChange.json()).code, 'INVALID_PASSWORD');
  assert.equal((await call('change-password', { currentPassword: password, newPassword: 'Newpass1' }, cookie)).status, 200);
  const routes = await import('../app/api/python/route');
  assert.equal((await routes.GET(new Request(base + '/api/python'))).status, 401);
  const second = await call('sign-up/email', { name: 'Other account', email: randomUUID() + '@example.test', password: 'Aa1' + randomUUID() });
  assert.equal(second.status, 200);
  const otherUser = (await second.json()).user;
  const longest = await call('sign-up/email', { name: 'Maximum password length', email: randomUUID() + '@example.test', password: 'Aa1' + 'x'.repeat(125) });
  assert.equal(longest.status, 200, '128-character passwords must be accepted');
  await database.query('INSERT INTO runs(id,user_id,report) VALUES($1,$2,$3),($4,$5,$6)', ['own', user.id, JSON.stringify({ id: 'own' }), 'other', otherUser.id, JSON.stringify({ id: 'other' })]);
  assert.deepEqual(await (await routes.GET(new Request(base + '/api/python', { headers: { Cookie: cookie } }))).json(), [{ id: 'own' }]);
  assert.equal((await routes.GET(new Request(base + '/api/python?id=other', { headers: { Cookie: cookie } }))).status, 404);
  const { jobs } = await import('../lib/python-jobs');
  await database.query('INSERT INTO runs(id,user_id,report) VALUES($1,$2,$3)', ['interrupted', user.id, JSON.stringify({id:'interrupted',status:'running',states:[{id:'B1',status:'Verified',reason:'Old',nodes:[]}]} )]);
  const interrupted = await (await routes.GET(new Request(base + '/api/python?id=interrupted', {headers:{Cookie:cookie}}))).json();
  assert.equal(interrupted.status,'cancelled'); assert.equal(interrupted.states[0].status,'Uncertain');
  const controller = new AbortController(); jobs.active.set(user.id,{id:'own',controller});
  const otherCookie = cookies(second);
  // Route tests use stored bytes; PDF parsing is covered by the Docker document tests.
  const documentId = randomUUID(), original = Buffer.from('original route fixture');
  const documentRoot = join(dataDir, 'documents', createHash('sha256').update(user.id).digest('hex'), documentId);
  await mkdir(documentRoot, { recursive: true });
  await writeFile(join(documentRoot, 'original'), original);
  await writeFile(join(documentRoot, 'document.json'), JSON.stringify({ id: documentId, fileName: 'requirements.pdf', sha256: createHash('sha256').update(original).digest('hex'), format: 'pdf', segments: [], warnings: [], pages: [] }));
  const documents = await import('../app/api/requirements/route');
  const readOriginal = (viewer = '', inline = true) => documents.GET(new Request(base + '/api/requirements?id=' + documentId + (inline ? '&view=inline' : ''), { headers: { Cookie: viewer } }));
  assert.equal((await readOriginal()).status, 401);
  assert.equal((await readOriginal(otherCookie)).status, 404);
  const inlinePdf = await readOriginal(cookie);
  assert.equal(inlinePdf.status, 200); assert.equal(inlinePdf.headers.get('Content-Type'), 'application/pdf');
  assert.match(inlinePdf.headers.get('Content-Disposition')!, /^inline;/);
  assert.equal(inlinePdf.headers.get('Cache-Control'), 'no-store');
  assert.equal(Buffer.from(await inlinePdf.arrayBuffer()).toString(), original.toString());
  assert.match((await readOriginal(cookie, false)).headers.get('Content-Disposition')!, /^attachment;/);
  await database.query("UPDATE runs SET report=jsonb_set(report,'{requirementDocument}',$1) WHERE id='own'", [JSON.stringify({ id: documentId })]);
  assert.equal((await routes.PATCH(new Request(base+'/api/python',{method:'PATCH',headers:{Cookie:otherCookie,'Content-Type':'application/json'},body:JSON.stringify({id:'own'})}))).status,404);
  assert.equal(controller.signal.aborted,false);
  assert.equal((await routes.PATCH(new Request(base+'/api/python',{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({id:'own'})}))).status,200);
  assert.equal(controller.signal.aborted,true); jobs.active.delete(user.id);
  for (const path of ['organization/create', 'organization/invite-member', 'organization/accept-invitation']) {
    assert.equal((await call(path, {}, cookie)).status, 404, 'Removed collaboration endpoints must be unavailable');
  }
  const stopController = new AbortController(); jobs.active.set(user.id, { id: 'own', controller: stopController });
  try {
    const retiredShare = await routes.PATCH(new Request(base + '/api/python', { method: 'PATCH', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'own', organizationId: null }) }));
    assert.equal(retiredShare.status, 400, 'A retired sharing request must not become a stop request');
    assert.equal(stopController.signal.aborted, false);
  } finally { jobs.active.delete(user.id); }
  assert.equal((await routes.GET(new Request(base + '/api/python?id=own', { headers: { Cookie: otherCookie } }))).status, 404);
  await writeFile(join(documentRoot, 'original'), 'changed original');
  assert.equal((await readOriginal(cookie)).status, 409, 'Changed originals must not be served under an old source hash');
  const parentId = randomUUID();
  await database.query('INSERT INTO runs(id,user_id,report) VALUES($1,$2,$3)', [parentId, user.id, JSON.stringify({ id: parentId, status: 'failed', requirementDocument: { id: documentId }, rules: [{ id: 'R1', text: 'Frozen requirement', source: { documentId, segmentId: 'S1', sha256: createHash('sha256').update(original).digest('hex') } }] })]);
  const previousKey = process.env.OPENAI_API_KEY; process.env.OPENAI_API_KEY = 'test-no-model-call';
  try {
    const form = new FormData(); form.set('parentRunId', parentId); form.set('reuseRequirements', 'true');
    const rerun = await routes.POST(new Request(base + '/api/python', { method: 'POST', headers: { Cookie: cookie, Origin: base }, body: form }));
    assert.equal(rerun.status, 422); assert.match((await rerun.json()).error, /integrity check/);
  } finally { if (previousKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = previousKey; }
  assert.equal((await routes.POST(new Request(base + '/api/python', { method: 'POST', headers: { Cookie: cookie, Origin: 'https://other.example' } }))).status, 403);
  const internalUrl = new Request('http://localhost:3001/api/python', { method: 'POST', headers: { Cookie: cookie, Origin: base, Host: '127.0.0.1:3001' } });
  assert.notEqual((await routes.POST(internalUrl)).status, 403, 'Next internal hostname must not reject the matching browser Host');
  const http = await import('../app/api/agent/stream/route');
  assert.equal((await http.GET(new Request(base))).status, 401);
  assert.equal((await routes.POST(new Request(base + '/api/python', { method: 'POST' }))).status, 401);
  assert.equal((await call('sign-out', {}, cookie)).status, 200);
  assert.equal(await session(new Request(base, { headers: { Cookie: cookie } })), null);
  const legacyPassword = 'legacy-password';
  const legacyHash = await (await auth.$context).password.hash(legacyPassword);
  await database.query('UPDATE account SET password=$1 WHERE "userId"=$2', [legacyHash, user.id]);
  assert.equal((await call('sign-in/email', { email, password: legacyPassword })).status, 200, 'Imported accounts can still use existing passwords');
});
