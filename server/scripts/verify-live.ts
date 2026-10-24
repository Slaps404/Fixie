// PHYSICAL verification against real Vapi + real phones. Needs a RUNNING server in live mode (VAPI_API_KEY set, DRY_RUN unset)
// and a reachable tunnel. Exits 2 (and prints what is missing) when VAPI_API_KEY is not set.
//
//   npm run verify:live                          preflight only
//   npm run verify:live -- --phone partsdirect   ring ONE roster phone through POST /demo/test-call and watch it end to end
//   npm run verify:live -- --intake              prints the Twilio number, waits for a real inbound call to reach start_job
//   flags: --skip-preflight  --timeout <sec>  --stop (intake: stop the job right after diagnosis)  BASE=http://host:port
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, loadRoster } from '../src/config.ts';
import { maskPhone } from '../src/events.ts';
import { vapiFetch } from '../src/vapi/client.ts';

const SERVER_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const BASE = (process.env.BASE ?? `http://localhost:${process.env.PORT ?? 3000}`).replace(/\/$/, '');
const ADMIN = process.env.ADMIN_TOKEN ?? 'fixie-demo';

const argv = process.argv.slice(2);
const flag = (n: string) => argv.includes(`--${n}`);
const opt = (n: string) => {
  const i = argv.indexOf(`--${n}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

interface Ev {
  id: number;
  ts: string;
  jobId: string | null;
  type: string;
  data: Record<string, any>;
  simulated?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const msg = (e: unknown) => ((e as Error)?.message ?? String(e)).slice(0, 300);

async function api(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ status: number; json: any; text: string }> {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin': ADMIN },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { status: res.status, json, text };
}

// ---------- reporting ----------
interface Row {
  ok: boolean | null; // null = informational
  what: string;
  detail: string;
}
const rows: Row[] = [];
const pass = (what: string, detail = '') => (rows.push({ ok: true, what, detail }), console.log(`  ✅ ${what}  ${detail}`));
const fail = (what: string, detail = '') => (rows.push({ ok: false, what, detail }), console.log(`  ❌ ${what}  ${detail}`));
const info = (what: string, detail = '') => (rows.push({ ok: null, what, detail }), console.log(`  ℹ️  ${what}  ${detail}`));

function finish(): never {
  const failed = rows.filter((r) => r.ok === false);
  console.log('\n=== verify:live summary ===');
  for (const r of rows) console.log(`${r.ok === null ? 'ℹ️ ' : r.ok ? '✅' : '❌'}  ${r.what}  ${r.detail}`);
  console.log(failed.length ? `\n${failed.length} check(s) FAILED. Do not go live until these are explained.` : '\nAll checks passed.');
  process.exit(failed.length ? 1 : 0);
}

// ---------- 0. config gate ----------
function configGate(): void {
  const need: Array<[string, boolean, string]> = [
    ['VAPI_API_KEY', !!config.vapi.apiKey, 'required: nothing here can run without it'],
    ['VAPI_PHONE_NUMBER_ID', !!config.vapi.phoneNumberId, 'outbound calls and the Twilio number lookup'],
    ['VAPI_INTAKE_ASSISTANT_ID', !!config.vapi.intakeAssistantId, 'inbound intake (npm run setup:vapi creates it)'],
    ['PUBLIC_URL', !!config.publicUrl, 'tunnel URL Vapi posts webhooks to'],
    ['VAPI_WEBHOOK_SECRET', !!config.webhookSecret, 'without it /vapi/webhook is open to the internet'],
  ];
  const missing = need.filter(([, ok]) => !ok);
  if (!config.vapi.apiKey) {
    console.error('verify:live needs real Vapi credentials. Missing:');
    for (const [k, , why] of missing) console.error(`  - ${k}  (${why})`);
    console.error('\nSet them in server/.env (see .env.example), start the server with DRY_RUN unset, then re-run.');
    console.error('To rehearse without phones use: npm run verify');
    process.exit(2);
  }
  for (const [k, , why] of missing) console.warn(`  ⚠️  ${k} is not set (${why})`);
}

// ---------- 1. preflight ----------
function runPreflight(): Promise<number> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['--import', 'tsx', 'scripts/preflight.ts'], { cwd: SERVER_DIR, stdio: 'inherit' });
    p.on('close', (c) => resolve(c ?? 1));
    p.on('error', () => resolve(1));
  });
}

async function serverGate(): Promise<boolean> {
  try {
    const r = await api('GET', '/health');
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    pass('server reachable', `${BASE}  dryRun=${r.json?.dryRun}  publicUrl=${r.json?.publicUrl ?? '(unset)'}`);
    if (r.json?.dryRun) {
      fail('server is in LIVE mode', 'it reports dryRun=true: calls would be simulated. Restart without DRY_RUN and with VAPI_API_KEY set.');
      return false;
    }
    return true;
  } catch (e) {
    fail('server reachable', `${BASE}/health: ${msg(e)}. Start it with: npm start`);
    return false;
  }
}

// ---------- event watching ----------
async function lastEventId(): Promise<number> {
  const r = await api('GET', '/events.json?since=0');
  const list = (r.json ?? []) as Ev[];
  return list.reduce((m, e) => Math.max(m, e.id), 0);
}
async function newEvents(since: number): Promise<Ev[]> {
  const r = await api('GET', `/events.json?since=${since}`);
  return Array.isArray(r.json) ? (r.json as Ev[]) : [];
}

// ---------- 2. --phone <rosterId> ----------
async function phoneTest(rosterId: string, timeoutSec: number): Promise<void> {
  let rosterEntry: { id: string; name: string; phone: string } | undefined;
  try {
    const r = loadRoster();
    rosterEntry = [r.user, r.warranty, ...r.suppliers, ...(r.tech ? [r.tech] : [])].find((e) => e.id === rosterId);
    if (!rosterEntry) {
      const known = [r.user, r.warranty, ...r.suppliers, ...(r.tech ? [r.tech] : [])].map((e) => e.id).join(', ');
      fail('roster id', `"${rosterId}" not in roster (known: ${known})`);
      return finish();
    }
  } catch (e) {
    fail('roster loads', msg(e));
    return finish();
  }
  console.log(`\nPlacing ONE real call to ${rosterEntry.name} (${maskPhone(rosterEntry.phone)}). Answer it and play the part.`);

  let cursor = await lastEventId();
  const tPost = Date.now();
  const placed = await api('POST', '/demo/test-call', { rosterId });
  if (placed.status !== 200 || !placed.json?.ok) {
    fail('POST /demo/test-call', `HTTP ${placed.status} ${placed.text.slice(0, 300)}`);
    return finish();
  }
  const { jobId, callId, lane, mode } = placed.json as { jobId: string; callId: string; lane: string; mode: string };
  pass('POST /demo/test-call', `job=${jobId} call=${callId} lane=${lane} mode=${mode} (${Date.now() - tPost} ms for Vapi to accept the call)`);
  if (mode !== 'live') fail('call is live', `server placed it in "${mode}" mode (MODE_${lane.toUpperCase()}=sim or /demo/mode?). Nothing will ring.`);

  const expectResult = lane === 'supplier' ? 'quote' : lane === 'warranty' ? 'warranty' : null;
  const seen: Ev[] = [];
  const mark: Record<string, number> = {};
  const stamp = (k: string) => (mark[k] ??= Date.now() - tPost);
  const deadline = Date.now() + timeoutSec * 1000;
  let apiLiveSeen = false;
  let lastApiPoll = 0;
  let ended: Ev | undefined;

  while (Date.now() < deadline && !ended) {
    const evs = await newEvents(cursor).catch(() => [] as Ev[]);
    for (const e of evs) {
      cursor = Math.max(cursor, e.id);
      if (e.jobId !== jobId) continue;
      seen.push(e);
      const mine = !e.data?.callId || e.data.callId === callId;
      if (!mine) continue;
      if (e.type === 'call_started') stamp('call_started');
      if (e.type === 'transcript') {
        stamp('first_transcript');
        console.log(`    ${String(e.data.speaker ?? '').padEnd(8)} ${String(e.data.text ?? '').slice(0, 120)}`);
      }
      if (e.type === 'quote') (stamp('quote'), console.log(`    quote: ${e.data.reason}`));
      if (e.type === 'warranty') (stamp('warranty'), console.log(`    warranty: covered=${e.data.covered} ${e.data.detail}`));
      if (e.type === 'order_confirmed' || e.type === 'order_declined') stamp('order_decision');
      if (e.type === 'guard') console.log(`    guard: ${e.data.kind}/${e.data.action} ${e.data.reason ?? ''}`);
      if (e.type === 'call_ended') {
        stamp('call_ended');
        ended = e;
      }
    }
    // Vapi-side liveness: the orchestrator emits no event for status "in-progress", so ask Vapi directly.
    if (!apiLiveSeen && Date.now() - lastApiPoll > 2000) {
      lastApiPoll = Date.now();
      try {
        const c = await vapiFetch<any>(`/call/${encodeURIComponent(callId)}`, { timeoutMs: 6000 });
        if (c?.status === 'in-progress' || c?.status === 'ended') (apiLiveSeen = true), stamp('api_live');
      } catch {
        // transient; keep watching events
      }
    }
    await sleep(500);
  }

  console.log('\nResults');
  const has = (k: string) => mark[k] !== undefined;
  const t = (k: string) => (has(k) ? `+${(mark[k] / 1000).toFixed(1)}s` : 'never');
  has('call_started') ? pass('call_started event', t('call_started')) : fail('call_started event', 'dialer did not report the call');
  has('first_transcript') || has('api_live')
    ? pass('call went live (answered)', `transcript ${t('first_transcript')}, Vapi status in-progress ${t('api_live')}`)
    : fail('call went live (answered)', 'no transcript and Vapi never reported in-progress: phone did not ring/answer, or webhooks are not arriving (tunnel? secret?)');
  has('first_transcript')
    ? pass('webhook path delivers transcripts', t('first_transcript'))
    : fail('webhook path delivers transcripts', 'no transcript events: check PUBLIC_URL, tunnel, X-Vapi-Secret on the assistant');
  if (expectResult === 'quote') has('quote') ? pass('quote recorded (record_quote tool call reached us)', t('quote')) : fail('quote recorded', 'say a price, shipping and the part number on the call');
  if (expectResult === 'warranty') has('warranty') ? pass('warranty recorded (record_warranty tool call reached us)', t('warranty')) : fail('warranty recorded', 'say covered / not covered on the call');
  if (lane === 'user') info('order decision', has('order_decision') ? `recorded ${t('order_decision')}` : 'not recorded (say "order it" to test; mock order only)');
  if (ended) {
    pass('call_ended event', `${t('call_ended')}  endedReason=${ended.data.endedReason}  mapped=${ended.data.reason}  durationSec=${ended.data.durationSec}`);
  } else {
    fail('call_ended event', `not seen within ${timeoutSec}s. End-of-call-report webhook is missing, or the call is still up (hang up, then check ${BASE}/events.json)`);
  }

  // Unverified Vapi facts, observed.
  console.log('\nUnverified Vapi facts observed');
  try {
    // The end-of-call object can lag the webhook by a moment.
    let call: any;
    for (let i = 0; i < 5; i++) {
      call = await vapiFetch<any>(`/call/${encodeURIComponent(callId)}`);
      if (call?.status === 'ended' && call?.cost !== undefined) break;
      await sleep(1500);
    }
    const wantName = `${jobId}|${rosterId}|${lane}`;
    info('call.cost present on GET /call/:id', call?.cost !== undefined ? `yes: $${call.cost}` : 'NO (agent spend cap will never trip)');
    info('call.name stored by Vapi', call?.name === wantName ? `yes: "${call.name}"` : `got "${call?.name}" (wanted "${wantName}")`);
    info('call.endedReason', String(call?.endedReason));
    info('call.monitor.controlUrl present', call?.monitor?.controlUrl ? 'yes (kill switch path A works)' : 'NO (kill switch falls back to DELETE /call/:id, unverified)');
    if (ended && call?.endedAt) {
      const lag = Date.parse(ended.ts) - Date.parse(call.endedAt);
      info('end-of-call webhook latency', `${(lag / 1000).toFixed(1)} s after Vapi's endedAt (includes clock skew)`);
    }
  } catch (e) {
    info('GET /call/:id', `failed: ${msg(e)}`);
  }
  try {
    const job = (await api('GET', `/jobs/${jobId}`)).json;
    info('webhook cost reached the server', job?.agentCostUsd > 0 ? `yes: job.agentCostUsd=$${job.agentCostUsd}` : `NO: job.agentCostUsd=${job?.agentCostUsd} (end-of-call-report has no cost field?)`);
    info('job.reservedMinutes after settle', String(job?.reservedMinutes?.toFixed?.(2) ?? job?.reservedMinutes));
  } catch {
    // ignore
  }
  info('webhook latency: dial to first transcript', has('first_transcript') ? t('first_transcript') : 'n/a');
  info('call.name echoed IN the webhook', 'not observable from events: the dialer registers context itself. Grep the server log for "[webhook] unknown call"; none means resolution never needed the echo');
  console.log(`\n  Throwaway job ${jobId} stays DIAGNOSED on the board; POST /demo/reset clears it.`);
  finish();
}

// ---------- 3. --intake ----------
async function intakeTest(timeoutSec: number): Promise<void> {
  let number = '';
  if (config.vapi.phoneNumberId) {
    try {
      const p = await vapiFetch<any>(`/phone-number/${encodeURIComponent(config.vapi.phoneNumberId)}`);
      number = String(p?.number ?? '');
    } catch (e) {
      info('phone number lookup', msg(e));
    }
  }
  let userPhone = '';
  try {
    userPhone = loadRoster().user.phone;
  } catch {
    // reported by preflight
  }
  const cursor0 = await lastEventId();
  console.log('\n' + '='.repeat(64));
  console.log(`  Call ${number || '<TWILIO NUMBER: set VAPI_PHONE_NUMBER_ID>'} now from Dorothy's phone (${maskPhone(userPhone)})`);
  console.log('  Say: "My dryer runs but the clothes come out cold. Whirlpool WED4815EW, bought in 2019."');
  console.log('='.repeat(64));
  console.log('  WARNING: when the intake call ends, the job starts REAL sourcing calls to the roster phones.');
  console.log(`  Use --stop to stop the job right after diagnosis, or POST ${BASE}/jobs/<id>/stop with x-admin.\n`);

  let cursor = cursor0;
  const deadline = Date.now() + timeoutSec * 1000;
  const want = new Set(['consent', 'diagnosis', 'part_identified']);
  const got = new Map<string, Ev>();
  let jobId: string | null = null;
  while (Date.now() < deadline && !(got.has('diagnosis') && got.has('part_identified'))) {
    for (const e of await newEvents(cursor).catch(() => [] as Ev[])) {
      cursor = Math.max(cursor, e.id);
      if (e.type === 'transcript') console.log(`    ${String(e.data.speaker ?? '').padEnd(8)} ${String(e.data.text ?? '').slice(0, 120)}`);
      if (e.type === 'error') console.log(`    error: ${JSON.stringify(e.data)}`);
      if (want.has(e.type) && !got.has(e.type)) {
        got.set(e.type, e);
        jobId = e.jobId ?? jobId;
        console.log(`  -> ${e.type} ${JSON.stringify(e.data).slice(0, 160)}`);
      }
    }
    await sleep(500);
  }
  const d = got.get('diagnosis');
  got.has('consent') ? pass('start_job reached the server (consent event)', `job=${jobId}`) : fail('start_job reached the server', 'no consent event: the intake assistant never called start_job, or the webhook did not arrive');
  d ? pass('diagnosis', `${d.data.issue} (confidence ${d.data.confidence})`) : fail('diagnosis', 'no diagnosis event');
  got.has('part_identified') ? pass('part identified', `${got.get('part_identified')!.data.partNumber}`) : fail('part identified', 'no part_identified event');
  if (jobId) {
    const j = (await api('GET', `/jobs/${jobId}`)).json;
    info('caller id captured', `job.customer.phone=${j?.customer?.phone} (must end in the same 4 digits as Dorothy's phone)`);
    if (userPhone && j?.customer?.phone) {
      const ok = String(j.customer.phone).slice(-4) === userPhone.slice(-4);
      ok ? pass('caller ID matches roster user', '') : fail('caller ID matches roster user', 'the callback would ring a different number');
    }
    if (flag('stop')) {
      const s = await api('POST', `/jobs/${jobId}/stop`, {});
      info('--stop', `job stopped (HTTP ${s.status})`);
    }
  }
  finish();
}

// ---------- main ----------
async function main(): Promise<void> {
  configGate();
  console.log('\n== preflight ==');
  if (flag('skip-preflight')) {
    info('preflight', 'skipped (--skip-preflight)');
  } else {
    const code = await runPreflight();
    code === 0 ? pass('preflight all green') : fail('preflight', 'one or more checks failed (see above)');
    if (code !== 0) return finish();
  }

  const phone = opt('phone');
  const intake = flag('intake');
  if (!phone && !intake) {
    console.log('\nPreflight passed. Next: --phone <rosterId> to ring a phone, --intake to test the inbound line.');
    return finish();
  }
  console.log('\n== server ==');
  if (!(await serverGate())) return finish();
  const timeout = Number(opt('timeout')) || (phone ? 240 : 180);
  if (phone) {
    console.log('\n== outbound call ==');
    await phoneTest(phone, timeout);
  }
  if (intake && !phone) {
    console.log('\n== inbound intake ==');
    await intakeTest(timeout);
  }
  finish();
}

main().catch((e) => {
  console.error(`verify:live crashed: ${msg(e)}`);
  process.exit(1);
});
