// Vapi assistant JSON builders (SPEC §6). Shapes from docs/review/vapi-api-facts.md.
import { config, getEpoch } from '../config.ts';
import type { AssistantSpec, ToolName } from '../contracts.ts';
import type { Lane } from '../types.ts';
import { intakePrompt, promptFor, type LanePrompt } from './prompts.ts';

export const SERVER_MESSAGES = [
  'tool-calls',
  'status-update',
  'end-of-call-report',
  'transcript[transcriptType="final"]',
  'hang',
];

const HAIKU = 'claude-haiku-5-5';
/** Intake needs longer than a callback; not in config.ts (frozen), so read the env directly. */
const INTAKE_MAX_SEC = Number(process.env.MAXSEC_INTAKE) || Math.max(config.maxSec.user, 180);

export function webhookUrl(): string {
  return `${config.publicUrl}/vapi/webhook`;
}

export function serverBlock(): { url: string; timeoutSeconds: number; headers?: Record<string, string> } {
  const s: { url: string; timeoutSeconds: number; headers?: Record<string, string> } = {
    url: webhookUrl(),
    timeoutSeconds: 20,
  };
  if (config.webhookSecret) s.headers = { 'X-Vapi-Secret': config.webhookSecret };
  return s;
}

type JsonSchema = Record<string, unknown>;

const TOOL_DEFS: Record<ToolName, { description: string; parameters: JsonSchema }> = {
  start_job: {
    description: 'Start a repair job once you know the appliance, model, and symptom. Returns a sentence to speak.',
    parameters: {
      type: 'object',
      properties: {
        callerName: { type: 'string', description: "Caller's first name" },
        appliance: { type: 'string', description: 'e.g. dryer' },
        model: { type: 'string', description: 'Model number, letters and digits only' },
        symptom: { type: 'string', description: 'What is wrong, in their words' },
        purchaseYear: { type: 'number', description: 'Year purchased, if known' },
        consentCallback: { type: 'boolean', description: 'True if they agreed to a callback on this number' },
      },
      required: ['appliance', 'model', 'symptom', 'consentCallback'],
    },
  },
  record_quote: {
    description: "Record the supplier's quote as soon as you hear the price. Call again if details change.",
    parameters: {
      type: 'object',
      properties: {
        price: { type: 'number', description: 'Part price in USD' },
        shipping: { type: 'number', description: 'Shipping in USD, 0 if free or pickup' },
        inStock: { type: 'boolean' },
        eta: { type: 'string', description: 'When it would arrive, e.g. Tuesday' },
        partNumberSaid: { type: 'string', description: 'The part number the supplier confirmed' },
      },
      required: ['price', 'inStock'],
    },
  },
  record_warranty: {
    description: 'Record whether the part is covered under warranty.',
    parameters: {
      type: 'object',
      properties: {
        covered: { type: 'boolean' },
        detail: { type: 'string', description: 'Short reason, e.g. 1-year warranty expired' },
      },
      required: ['covered'],
    },
  },
  record_order_decision: {
    description: 'Record whether the customer said to order the part.',
    parameters: {
      type: 'object',
      properties: { approved: { type: 'boolean', description: 'True only if they said order it' } },
      required: ['approved'],
    },
  },
  safety_ack: {
    description: 'Record a safety confirmation from the customer.',
    parameters: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['unplugged', 'vent_cleared'] } },
      required: ['kind'],
    },
  },
  record_test: {
    description:
      'Record the result of one diagnostic test the caller just did. Returns the next instruction to speak, or says the fault is confirmed.',
    parameters: {
      type: 'object',
      properties: {
        test: {
          type: 'string',
          enum: ['breaker_check', 'drum_spins', 'any_warmth', 'fuse_continuity', 'element_continuity', 'thermostat_continuity'],
          description: 'Which test was just done',
        },
        reading: {
          type: 'string',
          description:
            "The outcome: breaker_check ok|tripped; drum_spins yes|no; any_warmth some|none; fuse_continuity open|closed; element_continuity open|ok; thermostat_continuity open|closed. Use unknown if they can't tell.",
        },
      },
      required: ['test', 'reading'],
    },
  },
  install_progress: {
    description: 'Record the highest install step the customer finished. Returns the next step to speak.',
    parameters: {
      type: 'object',
      properties: { step: { type: 'integer', description: '1-based step number just finished' } },
      required: ['step'],
    },
  },
  report_fix: {
    description: 'Record whether the appliance works after the install.',
    parameters: {
      type: 'object',
      properties: { ok: { type: 'boolean' }, detail: { type: 'string' } },
      required: ['ok'],
    },
  },
};

const LANE_TOOLS: Record<Lane | 'intake', ToolName[]> = {
  intake: ['start_job', 'record_test', 'safety_ack'],
  warranty: ['record_warranty'],
  supplier: ['record_quote'],
  user: ['record_order_decision'],
  delivery: ['safety_ack', 'install_progress', 'report_fix'],
  tech: [],
};

export function toolsFor(lane: Lane | 'intake'): object[] {
  const server = serverBlock();
  const fns = LANE_TOOLS[lane].map((name) => ({
    type: 'function',
    function: { name, description: TOOL_DEFS[name].description, parameters: TOOL_DEFS[name].parameters },
    server,
  }));
  // `{type:'endCall'}` shape is unverified (vapi-api-facts F9) but documented as the replacement for endCallFunctionEnabled.
  return [...fns, { type: 'endCall' }];
}

/** Per-lane silence timeout. Delivery is an install walkthrough: the customer is quiet for a long time while working. */
const SILENCE_SEC: Record<Lane | 'intake', number> = {
  intake: 30,
  user: 30,
  delivery: 60,
  supplier: 15,
  warranty: 15,
  tech: 15,
};

function modelFor(lane: Lane | 'intake'): string {
  return lane === 'warranty' || lane === 'supplier' || lane === 'tech' ? HAIKU : config.vapi.model;
}

function voice(): object | undefined {
  return config.vapi.voiceId
    ? { provider: '11labs', voiceId: config.vapi.voiceId, model: 'eleven_flash_v2_5' }
    : undefined;
}

function assemble(opts: {
  name: string;
  lane: Lane | 'intake';
  prompt: LanePrompt;
  maxSec: number;
  metadata?: Record<string, unknown>;
}): Record<string, unknown> {
  const a: Record<string, unknown> = {
    name: opts.name.slice(0, 40),
    firstMessageMode: 'assistant-speaks-first',
    firstMessage: opts.prompt.firstMessage,
    model: {
      provider: 'anthropic',
      model: modelFor(opts.lane),
      messages: [{ role: 'system', content: opts.prompt.system }],
      tools: toolsFor(opts.lane),
    },
    maxDurationSeconds: opts.maxSec,
    silenceTimeoutSeconds: SILENCE_SEC[opts.lane],
    server: serverBlock(),
    serverMessages: SERVER_MESSAGES,
    // Deliberately NO voicemailDetection: AMD hangs up on real people (Opus #7).
  };
  const v = voice();
  if (v) a.voice = v;
  if (opts.metadata) a.metadata = opts.metadata;
  return a;
}

/** Transient assistant for an outbound lane call. */
export function buildAssistant(spec: AssistantSpec): Record<string, unknown> {
  return assemble({
    name: `Fixie ${spec.lane}${spec.vendor ? ` ${spec.vendor.id}` : ''}`,
    lane: spec.lane,
    prompt: promptFor(spec),
    maxSec: config.maxSec[spec.lane],
    metadata: {
      jobId: spec.job.id,
      vendorId: spec.vendor?.id ?? null,
      lane: spec.lane,
      // Extra (beyond SPEC): lets the webhook drop stale calls from before /demo/reset if metadata is echoed.
      epoch: getEpoch(),
      attempt: spec.attempt,
    },
  });
}

/** Persistent inbound assistant ("Fixie Intake"). Lane is user; jobId is unknown until start_job. */
export function buildIntakeAssistant(): Record<string, unknown> {
  return assemble({
    name: 'Fixie Intake',
    lane: 'intake',
    prompt: intakePrompt(),
    maxSec: INTAKE_MAX_SEC,
    metadata: { lane: 'user', intake: true },
  });
}
