// Archives every recorded Vapi call for the demo reel (site /admin/demo):
// demo-assets/recordings/<callId>.mp3 (stereo, agent and other party on separate channels)
// and <callId>.json (masked metadata, timed turns and tool calls, matching events, waveform peaks).
// Idempotent: audio is downloaded once; metadata and events are refreshed and merged on every run,
// so events survive a later /demo/reset of server/data/events.jsonl.
//   npx tsx scripts/fetch-recordings.ts [--limit 100]
import '../src/env.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getCall, vapiFetch } from '../src/vapi/client.ts';

const OUT = fileURLToPath(new URL('../../demo-assets/recordings/', import.meta.url));
const EVENTS = fileURLToPath(new URL('../data/events.jsonl', import.meta.url));
const PEAKS_PER_SEC = 20;
const limitArg = process.argv.indexOf('--limit');
const LIMIT = limitArg > 0 ? Number(process.argv[limitArg + 1]) : 100;

const mask = (n?: string) => (n ? `···${n.slice(-4)}` : null);
const ms = (iso?: string) => (iso ? Date.parse(iso) : NaN);

type Ev = { id: number; ts: string; jobId: string | null; type: string; data: any; simulated?: boolean };

function readEvents(): Ev[] {
  if (!existsSync(EVENTS)) return [];
  return readFileSync(EVENTS, 'utf8')
    .split('\n')
    .filter(Boolean)
    .flatMap((l) => {
      try {
        const e = JSON.parse(l) as Ev;
        return e.simulated ? [] : [e];
      } catch {
        return [];
      }
    });
}

/** 16-bit PCM WAV → per-channel peak envelope (0–255), PEAKS_PER_SEC buckets. */
function peaksOf(wav: Buffer): { channels: number[][]; sampleRate: number } {
  const channels = wav.readUInt16LE(22);
  const sampleRate = wav.readUInt32LE(24);
  let off = 12;
  while (off < wav.length - 8 && wav.toString('ascii', off, off + 4) !== 'data') off += 8 + wav.readUInt32LE(off + 4);
  const start = off + 8;
  const frames = Math.floor((wav.length - start) / (2 * channels));
  const bucket = Math.floor(sampleRate / PEAKS_PER_SEC);
  const out = Array.from({ length: channels }, () => [] as number[]);
  for (let b = 0; b * bucket < frames; b++) {
    for (let c = 0; c < channels; c++) {
      let peak = 0;
      for (let f = b * bucket; f < Math.min(frames, (b + 1) * bucket); f++) {
        const v = Math.abs(wav.readInt16LE(start + (f * channels + c) * 2));
        if (v > peak) peak = v;
      }
      out[c].push(Math.round(Math.sqrt(peak / 32768) * 255));
    }
  }
  return { channels: out, sampleRate };
}

/** Which stereo channel carries the agent: the louder one while the bot is speaking. */
function agentChannel(peaks: number[][], botTurns: Array<{ t: number; dur: number }>): 0 | 1 {
  const energy = [0, 0];
  for (const turn of botTurns) {
    for (let i = Math.floor(turn.t * PEAKS_PER_SEC); i < (turn.t + turn.dur) * PEAKS_PER_SEC; i++) {
      energy[0] += peaks[0][i] ?? 0;
      energy[1] += peaks[1]?.[i] ?? 0;
    }
  }
  return energy[1] > energy[0] ? 1 : 0;
}

function messagesOf(raw: any[]) {
  return raw.flatMap((m: any) => {
    const t = Number(m.secondsFromStart ?? 0);
    if (m.role === 'bot' || m.role === 'user')
      return [{ kind: 'say' as const, who: m.role === 'bot' ? ('agent' as const) : ('other' as const), t, dur: Number(m.duration ?? 0) / 1000, text: String(m.message ?? '') }];
    if (m.role === 'tool_calls')
      return (m.toolCalls ?? []).map((tc: any) => {
        let args: unknown = tc.function?.arguments;
        try {
          args = JSON.parse(String(args));
        } catch {}
        return { kind: 'tool' as const, t, id: tc.id, name: tc.function?.name, args };
      });
    if (m.role === 'tool_call_result') return [{ kind: 'result' as const, t, id: m.toolCallId, name: m.name, text: String(m.result ?? '') }];
    return [];
  });
}

async function listCalls(): Promise<any[]> {
  const all: any[] = [];
  let before: string | undefined;
  while (all.length < LIMIT) {
    const q = new URLSearchParams({ limit: String(Math.min(100, LIMIT - all.length)) });
    if (before) q.set('createdAtLt', before);
    const page: any[] = await vapiFetch(`/call?${q}`);
    if (!page.length) break;
    all.push(...page);
    before = page[page.length - 1].createdAt;
    if (page.length < 100) break;
  }
  return all;
}

async function archive(summary: any, events: Ev[]): Promise<string> {
  const id = String(summary.id);
  const jsonPath = `${OUT}${id}.json`;
  const mp3Path = `${OUT}${id}.mp3`;
  const prev = existsSync(jsonPath) ? JSON.parse(readFileSync(jsonPath, 'utf8')) : null;

  const call = await getCall(id);
  const a = call.artifact ?? {};
  const messages = messagesOf(a.messages ?? []);
  const startedAt = ms(call.startedAt);
  const endedAt = ms(call.endedAt);

  let peaks = prev?.peaks;
  let channel = prev?.agentChannel;
  if (!existsSync(mp3Path) || !peaks) {
    if (!a.presignedStereoUrl) return 'no recording';
    const res = await fetch(a.presignedStereoUrl);
    if (!res.ok) return `download ${res.status}`;
    const wav = Buffer.from(await res.arrayBuffer());
    const p = peaksOf(wav);
    channel = agentChannel(p.channels, messages.filter((m) => m.kind === 'say' && m.who === 'agent') as any);
    peaks = { rate: PEAKS_PER_SEC, agent: p.channels[channel], other: p.channels[1 - channel] ?? [] };
    const wavPath = `${OUT}${id}.wav`;
    writeFileSync(wavPath, wav);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wavPath, '-ac', '2', '-b:a', '64k', mp3Path]);
    rmSync(wavPath);
  }

  const [jobFromName, vendorFromName, laneFromName] = typeof call.name === 'string' ? call.name.split('|') : [];
  const own = events.filter((e) => e.data?.callId === id);
  const jobId = (jobFromName && jobFromName !== '-' ? jobFromName : null) ?? own.find((e) => e.jobId)?.jobId ?? null;
  // Job-level events with no callId (best_deal, metrics) attach to the call they happened during or just after.
  const nearby = events.filter((e) => !e.data?.callId && jobId && e.jobId === jobId && ms(e.ts) >= startedAt && ms(e.ts) <= endedAt + 15_000);
  const fresh = [...own, ...nearby].map((e) => ({ id: e.id, ts: e.ts, t: (ms(e.ts) - startedAt) / 1000, type: e.type, data: e.data }));
  const key = (e: { ts: string; type: string }) => `${e.ts}|${e.type}`;
  const merged = new Map<string, any>([...(prev?.events ?? []), ...fresh].map((e) => [key(e), e]));

  const started = own.find((e) => e.type === 'call_started')?.data;
  const record = {
    id,
    direction: call.type === 'inboundPhoneCall' ? 'inbound' : 'outbound',
    jobId,
    lane: (laneFromName ?? started?.lane ?? (call.type === 'inboundPhoneCall' ? 'intake' : null)) as string | null,
    vendorId: vendorFromName && vendorFromName !== '-' ? vendorFromName : null,
    party: started?.party ?? prev?.party ?? null,
    phone: mask(call.customer?.number),
    startedAt: call.startedAt,
    endedAt: call.endedAt,
    durationSec: (endedAt - startedAt) / 1000,
    endedReason: call.endedReason ?? null,
    costUsd: call.cost ?? null,
    agentChannel: channel,
    audio: `${id}.mp3`,
    peaks,
    messages,
    events: [...merged.values()].sort((x, y) => x.t - y.t),
  };
  writeFileSync(jsonPath, JSON.stringify(record));
  return prev ? 'refreshed' : 'archived';
}

mkdirSync(OUT, { recursive: true });
const events = readEvents();
const calls = (await listCalls()).filter((c) => c.status === 'ended' && c.startedAt && c.endedAt);
for (const c of calls) {
  try {
    console.log(`${c.id} ${c.startedAt} ${(c.name ?? c.type).padEnd(28)} ${await archive(c, events)}`);
  } catch (err) {
    console.log(`${c.id} failed: ${(err as Error).message}`);
  }
}
