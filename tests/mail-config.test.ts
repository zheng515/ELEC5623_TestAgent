import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { accountMailTransport, emailVerificationRequired, mailConfigured } from '../lib/mail';
import { configurationChecks } from '../lib/deployment';

test('configured email requires verification unless explicitly disabled for development', () => {
  assert.equal(mailConfigured({}), false);
  assert.equal(emailVerificationRequired({}), false);
  assert.equal(emailVerificationRequired({ REQTEST_LOCAL_MAIL: 'true' }), true);
  assert.equal(emailVerificationRequired({ SMTP_HOST: 'smtp.test', SMTP_FROM: 'sender@example.test' }), true);
  assert.equal(emailVerificationRequired({ REQTEST_LOCAL_MAIL: 'true', AUTH_REQUIRE_EMAIL_VERIFICATION: 'false' }), false);
  assert.equal(emailVerificationRequired({ AUTH_REQUIRE_EMAIL_VERIFICATION: 'true' }), true);
});

test('Gmail configuration requires authenticated STARTTLS on port 587', () => {
  const env = { NODE_ENV: 'test' as const, SMTP_HOST: 'smtp.gmail.com', SMTP_FROM: 'sender@example.test', SMTP_USER: 'sender@example.test', SMTP_PASSWORD: 'fixture-private-value', SMTP_PORT: '587', SMTP_SECURE: 'false' };
  assert.equal(configurationChecks(env).find(check => check.name === 'Gmail STARTTLS')?.status, 'passed');
  for (const overrides of [{ SMTP_PORT: '465' }, { SMTP_SECURE: 'true' }, { SMTP_USER: '', SMTP_PASSWORD: '' }]) {
    const checks = configurationChecks({ ...env, ...overrides });
    assert.equal(checks.find(check => check.name === 'Gmail STARTTLS')?.status, 'failed');
    assert.ok(!JSON.stringify(checks).includes(env.SMTP_PASSWORD));
  }
});

test('real SMTP refuses a TLS downgrade before sending credentials', { timeout: 15000 }, async context => {
  const keys = ['REQTEST_LOCAL_MAIL', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'SMTP_USER', 'SMTP_PASSWORD'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const commands: string[] = [];
  const server = createServer(socket => {
    socket.write('220 localhost ESMTP\r\n');
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk.toString();
      while (buffer.includes('\r\n')) {
        const index = buffer.indexOf('\r\n'), command = buffer.slice(0, index);
        buffer = buffer.slice(index + 2); commands.push(command);
        socket.write(command.startsWith('EHLO') ? '250-localhost\r\n250 AUTH PLAIN LOGIN\r\n' : '454 TLS not available\r\n');
      }
    });
  });
  context.after(async () => {
    for (const key of keys) { if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key]; }
    await new Promise<void>(resolve => server.close(() => resolve()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  Object.assign(process.env, { REQTEST_LOCAL_MAIL: 'false', SMTP_HOST: '127.0.0.1', SMTP_PORT: String((server.address() as { port: number }).port), SMTP_SECURE: 'false', SMTP_USER: 'fixture-user', SMTP_PASSWORD: 'fixture-password' });
  const transport = accountMailTransport();
  try { await assert.rejects(transport.verify()); }
  finally { transport.close(); }
  assert.ok(commands.includes('STARTTLS'));
  assert.ok(!commands.some(command => /AUTH|fixture-user|fixture-password/.test(command)));
});
