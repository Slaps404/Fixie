// Boot-time inbound setup: keep the persistent intake assistant pointed at the current PUBLIC_URL. Logs, never throws.
import { config } from './config.ts';
import { buildIntakeAssistant, webhookUrl } from './vapi/assistants.ts';
import { vapiFetch } from './vapi/client.ts';

export async function ensureInbound(): Promise<void> {
  try {
    if (config.dryRun) {
      console.log('[boot] dry run: skipping intake assistant sync');
      return;
    }
    if (!config.vapi.intakeAssistantId) {
      console.warn('[boot] VAPI_INTAKE_ASSISTANT_ID not set; run `npm run setup:vapi` to create the intake assistant');
      return;
    }
    if (!config.publicUrl) {
      console.warn('[boot] PUBLIC_URL not set; intake assistant NOT updated (webhooks would have nowhere to go)');
      return;
    }
    await vapiFetch(`/assistant/${encodeURIComponent(config.vapi.intakeAssistantId)}`, {
      method: 'PATCH',
      body: buildIntakeAssistant(),
    });
    console.log(`[boot] intake assistant synced → ${webhookUrl()}`);
  } catch (err) {
    console.error(`[boot] intake assistant sync failed: ${(err as Error).message}`);
  }
  if (!config.publicUrl) return;
  try {
    const res = await fetch(`${config.publicUrl}/health`, { signal: AbortSignal.timeout(8000) });
    console.log(`[boot] self-check ${config.publicUrl}/health → ${res.status}${res.ok ? ' OK' : ' FAIL'}`);
  } catch (err) {
    console.error(`[boot] self-check ${config.publicUrl}/health unreachable: ${(err as Error).message}`);
  }
}
