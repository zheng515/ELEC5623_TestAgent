import { loadEnvConfig } from '@next/env';

async function main() {
  loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
  const { mailConfigured, accountMailTransport } = await import('../lib/mail');
  if (!mailConfigured()) throw new Error('Configure SMTP_HOST and SMTP_FROM before checking email delivery.');
  const { configurationChecks } = await import('../lib/deployment');
  const failed = configurationChecks(process.env).filter(check => /SMTP|Gmail|Email verification/.test(check.name) && check.status === 'failed');
  if (failed.length) throw new Error(failed.map(check => check.detail).join(' '));
  const transport = accountMailTransport();
  try {
    await transport.verify();
    console.log(process.env.REQTEST_LOCAL_MAIL === 'true' ? 'Local Mailpit is reachable. No email was sent; external delivery is disabled.' : 'SMTP connection, encryption and authentication passed. No email was sent; inbox delivery is not confirmed.');
  } catch { throw new Error('SMTP check failed. Check the host, port, TLS support and credentials. No email was sent.'); }
  finally { transport.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
