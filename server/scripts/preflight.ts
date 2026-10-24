// Stage preflight: tunnel, Vapi auth, assistant URL, phone number attachment, roster phones. Usage: npm run preflight
import { config, loadRoster } from '../src/config.ts';
import { maskPhone } from '../src/events.ts';
import { webhookUrl } from '../src/vapi/assistants.ts';
import { vapiFetch } from '../src/vapi/client.ts';

type Row = { check: string; ok: boolean; detail: string };
const rows: Row[] = [];
const add = (check: string, ok: boolean, detail = '') => rows.push({ check, ok, detail });
const msg = (err: unknown) => (err as Error).message.slice(0, 160);

async function main(): Promise<void> {
  add('VAPI_API_KEY set', !!config.vapi.apiKey, config.dryRun ? 'dry run (all lanes sim)' : 'live');
  add('PUBLIC_URL set', !!config.publicUrl, config.publicUrl || '(unset)');

  // 1. Tunnel reachable
  if (config.publicUrl) {
    try {
      const res = await fetch(`${config.publicUrl}/health`, { signal: AbortSignal.timeout(8000) });
      add('PUBLIC_URL/health reachable', res.ok, `HTTP ${res.status}`);
    } catch (err) {
      add('PUBLIC_URL/health reachable', false, msg(err));
    }
  } else {
    add('PUBLIC_URL/health reachable', false, 'PUBLIC_URL unset');
  }

  // 2. Vapi auth + 3. assistant server.url
  const aid = config.vapi.intakeAssistantId;
  if (!config.vapi.apiKey) {
    add('Vapi auth', false, 'no API key');
  } else if (!aid) {
    add('Vapi auth (GET /assistant/:id)', false, 'VAPI_INTAKE_ASSISTANT_ID unset; run npm run setup:vapi');
  } else {
    try {
      const a = await vapiFetch<any>(`/assistant/${encodeURIComponent(aid)}`);
      add('Vapi auth (GET /assistant/:id)', true, a?.name ?? aid);
      const url = a?.server?.url ?? a?.serverUrl ?? '';
      add('Assistant server.url = PUBLIC_URL/vapi/webhook', url === webhookUrl(), url || '(none)');
    } catch (err) {
      add('Vapi auth (GET /assistant/:id)', false, msg(err));
    }
  }

  // 4. Phone number has the assistant attached
  const pid = config.vapi.phoneNumberId;
  if (config.vapi.apiKey && pid) {
    try {
      const p = await vapiFetch<any>(`/phone-number/${encodeURIComponent(pid)}`);
      add('Phone number → intake assistant', !!aid && p?.assistantId === aid, `${maskPhone(p?.number)} assistantId=${p?.assistantId ?? '(none)'}`);
    } catch (err) {
      add('Phone number → intake assistant', false, msg(err));
    }
  } else {
    add('Phone number → intake assistant', false, 'VAPI_PHONE_NUMBER_ID or API key unset');
  }

  // 5. Roster phones are E.164
  try {
    const r = loadRoster();
    const entries = [r.user, r.warranty, ...r.suppliers, ...(r.tech ? [r.tech] : [])];
    const e164 = /^\+[1-9]\d{7,14}$/;
    for (const e of entries) add(`Roster ${e.id} phone E.164`, e164.test(e.phone ?? ''), maskPhone(e.phone));
  } catch (err) {
    add('Roster loads', false, msg(err));
  }

  const w = Math.max(...rows.map((r) => r.check.length));
  console.log('\nFixie preflight\n');
  for (const r of rows) console.log(`${r.ok ? '✅' : '❌'}  ${r.check.padEnd(w)}  ${r.detail}`);
  const failed = rows.filter((r) => !r.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : '\nAll checks passed.');
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(`preflight crashed: ${msg(err)}`);
  process.exit(1);
});
