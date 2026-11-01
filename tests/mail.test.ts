import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { createEmailVerificationToken } from 'better-auth/api';
import { cookies } from './fixtures/auth';

test('SMTP signup requires a signed confirmation before login; recovery preserves password policy and revokes sessions', { skip: process.env.REQTEST_MAIL_TEST !== '1', timeout: 60000 }, async context => {
  if (existsSync('.env.local')) process.loadEnvFile('.env.local');
  process.env.REQTEST_LOCAL_MAIL = 'true'; process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
  process.env.REQTEST_DATA_NAMESPACE = 'mail_test_' + randomUUID().replaceAll('-', '');
  process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3001';
  const authModule = await import('../lib/auth'), auth = await authModule.getAuth(), db = authModule.database;
  const captured = new Set<string>();
  context.after(async () => {
    try {
      if (captured.size) assert.ok((await fetch('http://127.0.0.1:8025/api/v1/messages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ IDs: [...captured] }) })).ok);
    } finally {
      await db.query('DROP SCHEMA IF EXISTS "' + process.env.REQTEST_DATA_NAMESPACE + '" CASCADE');
      await db.end(); await rm(authModule.dataDir, { recursive: true, force: true });
    }
  });
  const base = process.env.BETTER_AUTH_URL, email = randomUUID() + '@example.test';
  const call = (path: string, body: object, cookie = '', ip = '127.0.0.1') => auth.handler(new Request(base + '/api/auth/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body),
  }));
  async function messageLink(subject: string) {
    const search = await (await fetch('http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent('to:' + email))).json();
    const items = search.messages.filter((item: { Subject: string }) => item.Subject === subject);
    for (const item of search.messages) captured.add(item.ID);
    assert.ok(items.length, 'Expected synthetic mail was captured locally');
    const message = await (await fetch('http://127.0.0.1:8025/api/v1/message/' + items[0].ID)).json();
    const match = String(message.Text).match(/https?:\/\/[^\s]+/); assert.ok(match);
    return new URL(match[0]);
  }
  const isVerified = async () => (await db.query('SELECT "emailVerified" FROM "user" WHERE email=$1', [email])).rows[0].emailVerified;
  const signup = await call('sign-up/email', { name: 'SMTP regression', email, password: 'Original123' });
  assert.equal(signup.status, 200);
  assert.ok(!cookies(signup).includes('session_token'), 'Unverified signup does not receive an authenticated session');
  assert.equal(await isVerified(), false);
  assert.equal((await call('sign-in/email', { email, password: 'Original123' })).status, 403);
  const verification = await messageLink('Verify your ReqTest email');
  assert.equal(verification.pathname, '/verify-email');
  assert.equal(verification.search, '', 'Bearer token is kept out of server query logs');
  const token = new URLSearchParams(verification.hash.slice(1)).get('token'); assert.ok(token);
  assert.equal((await call('send-verification-email', { email })).status, 200);
  assert.equal((await call('send-verification-email', { email: randomUUID() + '@example.test' })).status, 200, 'Unknown addresses receive the same success status');
  assert.equal(await isVerified(), false, 'Sending or resending mail does not verify an account');
  const { POST } = await import('../app/api/account/verify-email/route');
  const confirm = (value: string, origin = base) => POST(new Request(base + '/api/account/verify-email', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ token: value }) }));
  assert.equal((await confirm(token, 'https://other.example.test')).status, 403);
  assert.equal((await confirm('')).status, 400);
  const parts = token.split('.');
  parts[2] = (parts[2][0] === 'a' ? 'b' : 'a') + parts[2].slice(1);
  assert.equal((await confirm(parts.join('.'))).status, 400, 'Tampered signatures are rejected');
  const expired = await createEmailVerificationToken((await auth.$context).secret, email, undefined, -10);
  assert.equal((await confirm(expired)).status, 400, 'Expired framework-issued tokens are rejected');
  assert.equal(await isVerified(), false);
  const confirmed = await confirm(token);
  assert.equal(confirmed.status, 200);
  assert.equal(await isVerified(), true);
  assert.equal((await confirm(token)).status, 200, 'Repeated confirmation is idempotent');
  assert.ok(!cookies(confirmed).includes('session_token'), 'Confirmation does not silently sign in');
  const signin = await call('sign-in/email', { email, password: 'Original123' });
  assert.equal(signin.status, 200);
  const cookie = cookies(signin);
  assert.equal((await authModule.session(new Request(base, { headers: { Cookie: cookie } })))?.user.emailVerified, true);
  assert.equal((await call('send-verification-email', { email }, '', '192.0.2.2')).status, 200, 'Already verified addresses keep an existence-safe response');
  assert.equal((await call('request-password-reset', { email, redirectTo: base + '/reset-password' })).status, 200);
  const link = await messageLink('Reset your ReqTest password');
  const redirect = await auth.handler(new Request(link));
  const resetToken = new URL(redirect.headers.get('location') || link.toString()).searchParams.get('token'); assert.ok(resetToken);
  assert.equal((await call('reset-password', { token: resetToken, newPassword: 'weakpassword' })).status, 400);
  assert.equal((await call('reset-password', { token: resetToken, newPassword: 'Updated123' })).status, 200);
  assert.equal(await authModule.session(new Request(base, { headers: { Cookie: cookie } })), null);
  assert.equal((await call('sign-in/email', { email, password: 'Original123' }, '', '192.0.2.3')).status, 401);
  assert.equal((await call('sign-in/email', { email, password: 'Updated123' }, '', '192.0.2.4')).status, 200);
  assert.equal((await call('reset-password', { token: resetToken, newPassword: 'Another123' })).status, 400);
});
