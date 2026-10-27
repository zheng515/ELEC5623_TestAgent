import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';

export const cookies = (response: Response) => response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');

export async function authFixture(context: TestContext, prefix: string, beforeClose?: () => Promise<void> | void) {
  if (!process.env.DATABASE_URL && existsSync('.env.local')) process.loadEnvFile('.env.local');
  const namespace = prefix + '_' + randomUUID().replaceAll('-', '');
  process.env.REQTEST_DATA_NAMESPACE = namespace;
  process.env.REQTEST_LOCAL_MAIL = 'false';
  process.env.SMTP_HOST = '';
  const authModule = await import('../../lib/auth');
  const auth = await authModule.getAuth();
  const { database, dataDir } = authModule;
  context.after(async () => {
    try { await beforeClose?.(); }
    finally {
      await database.query('DROP SCHEMA IF EXISTS "' + namespace + '" CASCADE');
      await database.end();
      await rm(dataDir, { recursive: true, force: true });
    }
  });
  const base = process.env.BETTER_AUTH_URL || 'http://127.0.0.1:3001';
  const call = (path: string, body: object, cookie = '', ip = '127.0.0.1') => auth.handler(new Request(base + '/api/auth/' + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base, Cookie: cookie, 'X-Forwarded-For': ip }, body: JSON.stringify(body),
  }));
  async function account() {
    const response = await call('sign-up/email', { name: 'Test account', email: randomUUID() + '@example.test', password: 'Abcd1234' });
    assert.equal(response.status, 200);
    return { user: (await response.json()).user, cookie: cookies(response) };
  }
  return { ...authModule, auth, base, call, account };
}
