// Creates a Twilio Verify service and prints its SID. Paste the SID into the repo-root .env as TWILIO_VERIFY_SERVICE_SID.
// Usage: npm run verify:create   (reads TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN from the repo-root .env or the environment)
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(new URL('../..', import.meta.url).pathname);

const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token } = process.env;
if (!sid || !token) {
  console.error('Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in the repo-root .env first.');
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
console.log(`Add this line to the repo-root .env:\nTWILIO_VERIFY_SERVICE_SID=${json.sid}`);
