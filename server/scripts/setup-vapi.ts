// One-time Vapi setup: create (or update) the persistent intake assistant and attach it to the phone number.
// Usage: npm run setup:vapi   (needs VAPI_API_KEY, VAPI_PHONE_NUMBER_ID, PUBLIC_URL in server/.env)
import { config } from '../src/config.ts';
import { buildIntakeAssistant, webhookUrl } from '../src/vapi/assistants.ts';
import { vapiFetch } from '../src/vapi/client.ts';

async function main(): Promise<void> {
  if (!config.vapi.apiKey) throw new Error('VAPI_API_KEY is not set');
  if (!config.publicUrl) throw new Error('PUBLIC_URL is not set (the assistant server.url is built from it)');
  if (!config.vapi.phoneNumberId) throw new Error('VAPI_PHONE_NUMBER_ID is not set');

  let id = config.vapi.intakeAssistantId;
  const body = buildIntakeAssistant();
  if (id) {
    await vapiFetch(`/assistant/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    console.log(`Updated intake assistant ${id} → ${webhookUrl()}`);
  } else {
    const created = await vapiFetch<any>('/assistant', { method: 'POST', body });
    id = String(created?.id ?? '');
    if (!id) throw new Error(`POST /assistant returned no id: ${JSON.stringify(created).slice(0, 300)}`);
    console.log(`Created intake assistant ${id} → ${webhookUrl()}`);
  }

  await vapiFetch(`/phone-number/${encodeURIComponent(config.vapi.phoneNumberId)}`, {
    method: 'PATCH',
    body: { assistantId: id },
  });
  console.log(`Attached assistant to phone number ${config.vapi.phoneNumberId}`);

  if (!config.vapi.intakeAssistantId) {
    console.log('\nAdd this line to server/.env:\n');
    console.log(`VAPI_INTAKE_ASSISTANT_ID=${id}\n`);
  }
}

main().catch((err) => {
  console.error(`setup-vapi failed: ${(err as Error).message}`);
  process.exit(1);
});
