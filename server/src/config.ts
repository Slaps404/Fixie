import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { Lane, Roster } from './types.ts';
import type { Mode } from './contracts.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
export const DATA_DIR = join(root, 'data');

const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);

export const config = {
  port: num(process.env.PORT, 3000),
  publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
  dryRun: process.env.DRY_RUN === '1' || !process.env.VAPI_API_KEY,
  vapi: {
    apiKey: process.env.VAPI_API_KEY ?? '',
    phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID ?? '',
    intakeAssistantId: process.env.VAPI_INTAKE_ASSISTANT_ID ?? '',
    voiceId: process.env.VAPI_VOICE_ID ?? '',
    model: process.env.FIXIE_MODEL ?? 'claude-sonnet-5',
  },
  anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
  /** Shared secret Vapi sends back in the X-Vapi-Secret header. */
  webhookSecret: process.env.VAPI_WEBHOOK_SECRET ?? '',
  caps: {
    maxCalls: num(process.env.CAP_MAX_CALLS, 8),
    maxMinutes: num(process.env.CAP_MAX_MINUTES, 20),
    budget: num(process.env.CAP_BUDGET, 40),
    maxCallSeconds: num(process.env.CAP_MAX_CALL_SECONDS, 180),
    maxCallsPerVendor: num(process.env.CAP_MAX_CALLS_PER_VENDOR, 2),
    stuckSeconds: num(process.env.CAP_STUCK_SECONDS, 35),
    sourcingTimeoutSeconds: num(process.env.CAP_SOURCING_TIMEOUT_SECONDS, 75),
    /** Start sourcing this long after start_job if the intake call hasn't reported ended. */
    sourcingFallbackSeconds: num(process.env.CAP_SOURCING_FALLBACK_SECONDS, 25),
  },
  /** Agent (Vapi) spend cap per job, USD. */
  spendCap: num(process.env.CAP_AGENT_SPEND, 3),
  /** Budget cap for enterprise (tech) jobs, USD. */
  techBudget: num(process.env.CAP_TECH_BUDGET, 1500),
  /** Max call length per lane, seconds. */
  maxSec: {
    user: num(process.env.MAXSEC_USER, 90),
    warranty: num(process.env.MAXSEC_WARRANTY, 60),
    supplier: num(process.env.MAXSEC_SUPPLIER, 60),
    delivery: num(process.env.MAXSEC_DELIVERY, 480),
    tech: num(process.env.MAXSEC_TECH, 60),
  } as Record<Lane, number>,
  /** Sim speed multiplier: 1 = realistic call timing, 4 = fast rehearsal. */
  simSpeed: num(process.env.SIM_SPEED, 1),
  /** Token required in the x-admin header for /demo/*, /simulate/*, /fault, /jobs/:id/stop. */
  adminToken: process.env.ADMIN_TOKEN ?? 'fixie-demo',
};

/** Per-lane mode, switchable at runtime via POST /demo/mode. Without a Vapi key, everything is sim. */
const laneModes: Partial<Record<Lane, Mode>> = {};
for (const lane of ['user', 'warranty', 'supplier', 'delivery', 'tech'] as Lane[]) {
  const v = process.env[`MODE_${lane.toUpperCase()}`];
  if (v === 'live' || v === 'sim') laneModes[lane] = v;
}
export function modeFor(lane: Lane): Mode {
  if (config.dryRun) return 'sim';
  return laneModes[lane] ?? 'live';
}
export function setMode(lane: Lane, mode: Mode): void {
  laneModes[lane] = mode;
}

/** Demo epoch: bumped by /demo/reset so stale webhooks are ignored. */
let epoch = 1;
export const getEpoch = () => epoch;
export const bumpEpoch = () => ++epoch;

export function loadRoster(): Roster {
  const file = process.env.ROSTER_FILE ?? join(DATA_DIR, 'roster.json');
  return JSON.parse(readFileSync(file, 'utf8')) as Roster;
}
