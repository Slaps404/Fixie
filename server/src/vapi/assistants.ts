// Vapi assistant JSON builders (SPEC §6). Shapes from docs/review/vapi-api-facts.md.
import { config, getEpoch } from '../config.ts';
import type { AssistantSpec, ToolName } from '../contracts.ts';
import type { Lane } from '../types.ts';
import { CONCEPTS } from '../memory.ts';
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
const INTAKE_MAX_SEC = Number(process.env.MAXSEC_INTAKE) || Math.max(config.maxSec.user, 420);

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
          enum: ['has_meter', 'breaker_check', 'drum_spins', 'any_warmth', 'fuse_continuity', 'element_continuity', 'thermostat_continuity'],
          description: 'Which test was just done',
        },
        reading: {
          type: 'string',
          description:
            "The outcome: has_meter yes|no|unknown (no also when they do not know what a multimeter is); breaker_check ok|tripped; drum_spins yes|no; any_warmth some|none; fuse_continuity open|closed; element_continuity open|ok; thermostat_continuity open|closed. Use unknown if they can't tell.",
        },
      },
      required: ['test', 'reading'],
    },
  },
  lookup_caller: {
    description:
      'Look up the caller by their phone number. Call this FIRST, silently, before asking anything. Returns "New caller." or what we already know about them.',
    parameters: { type: 'object', properties: {} },
  },
  record_knowledge: {
    description:
      'Say this when the caller shows they do or do not know a term ("what\'s a breaker?", "I don\'t know what that is"). Call it alongside your speech, never instead of speaking.',
    parameters: {
      type: 'object',
      properties: {
        concept: { type: 'string', enum: Object.keys(CONCEPTS) },
        knows: { type: 'boolean', description: 'True if they know it, false if they do not' },
      },
      required: ['concept', 'knows'],
    },
  },
  end_call: {
    description:
      'Hang up. Only after record_quote (supplier) or record_warranty (warranty) has been called. Say your thank-you and goodbye in the same reply. If it says you are missing something, ask for it instead.',
    parameters: { type: 'object', properties: {} },
  },
  send_text: {
    description:
      "Text the customer on this call (WhatsApp). Use it whenever a written copy helps or they ask for one: the install steps, the price, what happens next. Say you're sending it in the same reply.",
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The text, short and plain, signed as Fixie' },
        includeInstallSteps: { type: 'boolean', description: 'Append the numbered install steps for their part' },
        includeVideoLink: { type: 'boolean', description: 'Append a link to how-to videos for their exact part' },
      },
      required: ['message'],
    },
  },
  save_note: {
    description:
      'Write a private note about this customer for your future calls: preferences, constraints, promises you made, anything you would want to know next time. Not read aloud. Call alongside your speech.',
    parameters: {
      type: 'object',
      properties: { note: { type: 'string', description: 'One short sentence, e.g. "Prefers texts over calls; daughter Ann helps with tools."' } },
      required: ['note'],
    },
  },
  job_details: {
    description:
      "Everything that happened on this customer's job: diagnosis, the warranty answer, every supplier quote and what each supplier and the warranty line said, the order, notes. Use it before answering any question about the job you can't answer from what you already have.",
    parameters: { type: 'object', properties: {} },
  },
  web_search: {
    description:
      "Search the web when you are not sure of a fact (a model's specs, a part, how something works, store hours). Say you'll look it up in the same reply. Answer only from the results.",
    parameters: {
      type: 'object',
      properties: { query: { type: 'string', description: 'A specific search query, e.g. "Whirlpool WED4815EW thermal fuse location"' } },
      required: ['query'],
    },
  },
  mark_delivered: {
    description: 'The customer says their ordered part has arrived. Records the delivery and returns how to start the install on this call.',
    parameters: { type: 'object', properties: {} },
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

/** Every customer-facing call carries the same toolkit, so the agent can handle whatever the customer brings up, whichever call it is. */
const CUSTOMER_TOOLS: ToolName[] = [
  'record_order_decision',
  'mark_delivered',
  'safety_ack',
  'install_progress',
  'report_fix',
  'send_text',
  'save_note',
  'record_knowledge',
  'job_details',
  'web_search',
];
const LANE_TOOLS: Record<Lane | 'intake', ToolName[]> = {
  intake: ['lookup_caller', 'start_job', 'record_test', 'record_warranty', 'record_quote', ...CUSTOMER_TOOLS],
  warranty: ['record_warranty', 'end_call'],
  supplier: ['record_quote', 'end_call'],
  user: CUSTOMER_TOOLS,
  delivery: CUSTOMER_TOOLS,
  tech: [],
};

/** Fire-and-forget tools: Vapi moves on without waiting for our reply. */
const ASYNC_TOOLS = new Set<ToolName>(['record_knowledge', 'save_note', 'send_text']);

export function toolsFor(lane: Lane | 'intake'): object[] {
  const server = serverBlock();
  const fns = LANE_TOOLS[lane].map((name) => ({
    type: 'function',
    ...(ASYNC_TOOLS.has(name) && { async: true }),
    // An explicit empty request-start replaces Vapi's default fillers ("Hold on a sec", "One moment"); the prompt covers the gap.
    ...(!ASYNC_TOOLS.has(name) && { messages: [{ type: 'request-start', content: '' }] }),
    function: { name, description: TOOL_DEFS[name].description, parameters: TOOL_DEFS[name].parameters },
    server,
  }));
  // Lanes with our end_call tool can't hang up on their own; the server decides (no quote yet → keep talking).
  if (LANE_TOOLS[lane].includes('end_call')) return fns;
  // `{type:'endCall'}` shape is unverified (vapi-api-facts F9) but documented as the replacement for endCallFunctionEnabled.
  return [...fns, { type: 'endCall' }];
}

/** Per-lane silence timeout. Delivery is an install walkthrough: the customer is quiet for a long time while working. */
const SILENCE_SEC: Record<Lane | 'intake', number> = {
  intake: 45,
  user: 30,
  delivery: 600,
  supplier: 15,
  warranty: 15,
  tech: 15,
};

const KEYTERMS = ['multimeter', 'thermal fuse', 'heating element', 'thermostat', 'breaker', 'Whirlpool', 'Maytag', 'Kenmore', 'Samsung', 'LG', 'GE', 'warranty'];

/** Deepgram nova-3 with keyterm prompting, so model and part numbers transcribe right. */
function transcriber(extra: Array<string | undefined>): object {
  const keyterm = [...new Set([...KEYTERMS, ...extra.filter((t): t is string => !!t)])].slice(0, 20);
  return { provider: 'deepgram', model: 'nova-3', language: 'en', smartFormat: true, keyterm };
}
const TRANSCRIBED_LANES = new Set<Lane | 'intake'>(['intake', 'user', 'delivery', 'supplier', 'warranty']);

/** Re-prompt after customer silence; the counter resets whenever they speak. Vapi minimum timeoutSeconds is 2. */
function speechTimeout(timeoutSeconds: number, prompt: string): object[] {
  return [{ on: 'customer.speech.timeout', options: { timeoutSeconds, triggerMaxCount: 3, triggerResetMode: 'onUserSpeech' }, do: [{ type: 'say', prompt }] }];
}
const GONE_QUIET = speechTimeout(
  5,
  "The caller has gone quiet. In under 12 words: if you were cut off, say 'Sorry, go ahead' and repeat your last question; otherwise gently repeat your last question.",
);
const WORKING_QUIET = speechTimeout(45, "The caller is quiet because they're working with their hands. Say only: 'Take your time, I'm right here.' Never end the call for silence.");

/** Conversational lanes: ignore 1-2 word noise (2 let line noise cut the bot off mid-sentence on live calls), wait a beat before replying, denoise the line. Machine lanes keep Vapi defaults. */
const CONVERSATION_TUNING = {
  stopSpeakingPlan: {
    numWords: 3,
    backoffSeconds: 1,
    acknowledgementPhrases: ['ok', 'okay', 'uh huh', 'uh-huh', 'mhm', 'mm-hmm', 'mm hmm', 'yeah', 'yep', 'yup', 'right', 'alright', 'got it', 'sure', 'yes', 'I see', 'go on'],
  },
  // Live-call control URL: the expert coach (expert.ts) inserts silent notes through it.
  monitorPlan: { controlEnabled: true },
  // x = LiveKit's probability they're still talking. Capped at 2.2 s: uncapped, a trailing "like," left a caller in 8 s of silence, three times in one call.
  startSpeakingPlan: { waitSeconds: 0.3, smartEndpointingPlan: { provider: 'livekit', waitFunction: '300 + 1900 * x' } },
  backgroundSpeechDenoisingPlan: { smartDenoisingPlan: { enabled: true } },
};
const TUNING: Partial<Record<Lane | 'intake', object>> = {
  intake: { ...CONVERSATION_TUNING, hooks: GONE_QUIET },
  user: { ...CONVERSATION_TUNING, hooks: GONE_QUIET },
  delivery: { ...CONVERSATION_TUNING, hooks: WORKING_QUIET },
};

/** Customer calls run on Haiku too: same eval pass rate as Sonnet on the replayed live calls, ~0.5 s faster to first token per turn. */
const CUSTOMER_MODEL = process.env.FIXIE_CUSTOMER_MODEL || HAIKU;

function modelFor(lane: Lane | 'intake'): string {
  return lane === 'warranty' || lane === 'supplier' || lane === 'tech' ? HAIKU : CUSTOMER_MODEL;
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
  keyterms?: Array<string | undefined>;
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
  if (TRANSCRIBED_LANES.has(opts.lane)) a.transcriber = transcriber(opts.keyterms ?? []);
  Object.assign(a, TUNING[opts.lane]);
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
    keyterms: [spec.job.model, spec.job.part?.partNumber],
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
