// Creates a Twilio Verify service and prints its SID. Paste the SID into site/.env.local as TWILIO_VERIFY_SERVICE_SID.
// Usage: npm run verify:create   (reads TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from site/.env.local or the environment)
import { readFileSync } from 'node:fs';

function loadEnvLocal() {
  try {
    for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {}
}
loadEnvLocal();

const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = process.env;
if (!sid || !token) {
  console.error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in site/.env.local first.');
  process.exit(1);
}

const res = await fetch('https://verify.twilio.com/v2/Services', {
  method: 'POST',
  headers: {
    authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
    'content-type': 'application/x-www-form-urlencoded',
  },
  body: new URLSearchParams({ FriendlyName: 'Fixie', CodeLength: '6' }),
});
const json = await res.json();
if (!res.ok) {
  console.error(`Twilio said no (${res.status}): ${json.message ?? 'unknown error'}`);
  process.exit(1);
}
console.log(`Created Verify service "${json.friendly_name}".`);
console.log(`Add this line to site/.env.local:\nTWILIO_VERIFY_SERVICE_SID=${json.sid}`);
