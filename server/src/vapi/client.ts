// Live Vapi provider: plain fetch against https://api.vapi.ai.
import { config } from '../config.ts';
import { emit } from '../events.ts';
import type { CallCtx, VoiceProvider } from '../contracts.ts';
import { buildAssistant } from './assistants.ts';

export const VAPI_BASE = 'https://api.vapi.ai';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class VapiError extends Error {
  constructor(
    public status: number,
    public body: string,
    path: string,
  ) {
    super(`Vapi ${status} on ${path}: ${body.slice(0, 500)}`);
  }
}

/** JSON request to the Vapi API. 5xx (and network errors) → one retry after 2 s. 4xx → throws VapiError with the body text. */
export async function vapiFetch<T = any>(
  path: string,
  init: { method?: string; body?: unknown; timeoutMs?: number } = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${VAPI_BASE}${path}`;
  const doFetch = () =>
    fetch(url, {
      method: init.method ?? 'GET',
      headers: { Authorization: `Bearer ${config.vapi.apiKey}`, 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 15000),
    });
  // Network errors are retried only for non-POST requests, so a timed-out POST /call can't double-dial.
  const retryNetwork = (init.method ?? 'GET') !== 'POST';
  let res: Response;
  try {
    res = await doFetch();
  } catch (err) {
    if (!retryNetwork) throw err;
    await sleep(2000);
    res = await doFetch();
  }
  if (res.status >= 500) {
    await sleep(2000);
    res = await doFetch();
  }
  const text = await res.text();
  if (!res.ok) throw new VapiError(res.status, text, path);
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}

export async function getCall(id: string): Promise<any> {
  return vapiFetch(`/call/${encodeURIComponent(id)}`);
}

export const vapiProvider: VoiceProvider = {
  async createCall({ to, name, spec }) {
    const body = {
      name,
      phoneNumberId: config.vapi.phoneNumberId,
      customer: { number: to },
      // monitorPlan.controlEnabled makes Vapi return monitor.controlUrl, which endCall needs to hang up a live call.
      assistant: (() => {
        const a = buildAssistant(spec) as Record<string, any>;
        return { ...a, monitorPlan: { controlEnabled: true, ...(a.monitorPlan ?? {}) } };
      })(),
    };
    const res = await vapiFetch<any>('/call', { method: 'POST', body });
    // Documented in the schema; 201 shape unverified (vapi-api-facts F7). The dialer retries on 'concurrency'.
    if (res?.subscriptionLimits?.concurrencyBlocked === true) {
      throw new Error('Vapi concurrency limit reached (subscriptionLimits.concurrencyBlocked)');
    }
    if (!res?.id) throw new Error(`Vapi createCall returned no id: ${JSON.stringify(res).slice(0, 300)}`);
    const controlUrl: string | undefined = res.monitor?.controlUrl ?? undefined;
    if (!controlUrl) {
      console.error(`[vapi] createCall ${res.id}: response has NO monitor.controlUrl; kill switch / spend stop cannot hang this call up (maxDurationSeconds backstop only)`);
    }
    return { callId: String(res.id), controlUrl };
  },

  async endCall(call: CallCtx) {
    // Primary: live-control message POST {controlUrl} {type:'end-call'} (controlUrl exists because createCall sets monitorPlan.controlEnabled).
    // Fallback (controlUrl missing or its POST failed): DELETE /call/:id, best effort (documented as deleting call data, not known to hang up).
    // Afterwards a background check polls GET /call/:id and emits an error event if the call is still live. Never throws.
    let ok = false;
    if (!call.controlUrl) {
      console.error(`[vapi] endCall ${call.callId}: NO controlUrl (monitorPlan.controlEnabled not honored?), falling back to DELETE`);
    } else {
      try {
        const res = await fetch(call.controlUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'end-call' }),
          signal: AbortSignal.timeout(5000),
        });
        ok = res.ok;
        if (!res.ok) console.warn(`[vapi] endCall ${call.callId}: controlUrl returned ${res.status} ${(await res.text()).slice(0, 200)}`);
      } catch (err) {
        console.warn(`[vapi] endCall ${call.callId}: controlUrl POST failed: ${(err as Error).message}`);
      }
    }
    if (!ok) {
      try {
        await vapiFetch(`/call/${encodeURIComponent(call.callId)}`, { method: 'DELETE', timeoutMs: 5000 });
      } catch (err) {
        console.warn(`[vapi] endCall ${call.callId}: DELETE fallback failed: ${(err as Error).message}`);
      }
    }
    void verifyEnded(call);
  },
};

const LIVE_STATUSES = new Set(['queued', 'ringing', 'in-progress']);

/** ~3 s after an end request, confirm via GET /call/:id that the call is no longer live; otherwise emit a loud error event. */
async function verifyEnded(call: CallCtx): Promise<void> {
  try {
    await sleep(3000);
    const c = await getCall(call.callId);
    if (c?.status && LIVE_STATUSES.has(c.status)) {
      console.error(`[vapi] endCall ${call.callId}: still ${c.status} 3s after end request`);
      emit(call.jobId, 'error', {
        where: 'endCall',
        callId: call.callId,
        detail: `call still ${c.status} 3s after end request; it will run until maxDurationSeconds (${call.maxSec}s)`,
      });
    }
  } catch (err) {
    console.warn(`[vapi] endCall ${call.callId}: end verification failed: ${(err as Error).message}`);
  }
}
