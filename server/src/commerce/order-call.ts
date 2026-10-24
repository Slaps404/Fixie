// Phone order call: Fixie calls the winning roster vendor back and pays by reading the card aloud.
// The card is not in the prompt. The agent asks for it with the read_card tool, and the server releases it
// only on the winning vendor's call, to the roster number, after the vendor has stated a total at or under
// the approved one. Expiry and CVC are released separately and only after the number.
import type { CallCtx } from '../contracts.ts';
import type { Job } from '../types.ts';
import type { LanePrompt } from '../vapi/prompts.ts';
import type { Vault } from './vault.ts';

/** Merge into the order call's Vapi assistant JSON. Field names per docs.vapi.ai/security-and-privacy/pci. */
export const ORDER_CALL_OVERRIDES = {
  artifactPlan: { recordingEnabled: false, loggingEnabled: false, transcriptPlan: { enabled: false } },
  compliancePlan: { pciEnabled: true },
} as const;

/** Vapi function-tool parameter schemas, same shape as TOOL_DEFS in assistants.ts. */
export const ORDER_TOOL_DEFS = {
  read_card: {
    description: 'Get the payment card to read to the vendor. Call with part "number" only after the vendor has told you the total; call "expiry" or "cvc" only if the vendor asks for it.',
    parameters: {
      type: 'object',
      properties: {
        part: { type: 'string', enum: ['number', 'expiry', 'cvc'] },
        totalQuoted: { type: 'number', description: 'The total in USD the vendor just confirmed, including shipping' },
      },
      required: ['part', 'totalQuoted'],
    },
  },
  record_order_result: {
    description: 'Record whether the vendor placed the order, with their order or confirmation number if they gave one.',
    parameters: {
      type: 'object',
      properties: {
        placed: { type: 'boolean' },
        orderNumber: { type: 'string' },
        total: { type: 'number', description: 'Final total in USD the vendor charged' },
      },
      required: ['placed'],
    },
  },
} as const;

const money = (n: number) => `$${n.toFixed(2)}`;

export function orderCallPrompt(job: Job, vendorName: string, last4: string, shipTo: string): LanePrompt {
  const deal = job.bestDeal;
  const total = deal?.landedTotal ?? 0;
  return {
    firstMessage: `Hi, I'm an AI assistant calling back for a customer about part ${job.part?.partNumber ?? ''}. I'd like to place the order we discussed. This call is not recorded.`,
    system: `You are on a live phone call. Speak in short, natural sentences, one question at a time. Never use lists, markdown, or emoji.
You are an AI assistant calling ${vendorName} back to buy one ${job.part?.name ?? 'part'}, part number ${job.part?.partNumber ?? 'unknown'}, for a customer. They quoted ${money(total)} total with shipping. The approved maximum is ${money(total)}.
Ship to: ${shipTo}.
Steps, one at a time:
1. Confirm they still have it and give the part number.
2. Ask: "What's the total with shipping?" Wait for the number.
3. If the total is ${money(total)} or less, call read_card with part "number" and the total they said. Read the result to them exactly as the tool gives it, slowly, in groups of four, then stop and wait. If the tool says not to read the card, follow what it says.
4. Give the expiry or the security code ONLY if they ask for it: call read_card with part "expiry" or "cvc" and read exactly what it returns.
5. Ask for an order or confirmation number, then call record_order_result. Thank them and end the call.
If the total is higher than ${money(total)}, do not pay. Say you need to check with the customer, call record_order_result with placed false, and end the call.
Never say the card number except right after read_card returns it. Never repeat it unless they ask you to. The card ends in ${last4} if they ask which card.`,
  };
}

/** "4 2 4 2, 4 2 4 2, ...": digits spaced so TTS reads single digits, groups of four. */
export function spokenGroups(pan: string): string {
  const groups: string[] = [];
  for (let i = 0; i < pan.length; i += 4) groups.push(pan.slice(i, i + 4).split('').join(' '));
  return groups.join(', ');
}

const DIGIT_WORD = '(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)';
const DIGIT_RUN = /(?:\d[\s,.-]*){12,19}/g;
const WORD_RUN = new RegExp(`(?:\\b${DIGIT_WORD}\\b[\\s,.-]*){12,}`, 'gi');
const CVC_RUN = /\b((?:security code|cvc|cvv)\D{0,12})\d{3,4}\b/gi;

/** Strip card numbers (digits or spoken digit words) and security codes from transcript text before it is stored or emitted. */
export function redactPan(text: string): string {
  return text
    .replace(DIGIT_RUN, (m) => {
      const d = m.replace(/\D/g, '');
      return `[card ···${d.slice(-4)}]${/\s$/.test(m) ? ' ' : ''}`;
    })
    .replace(WORD_RUN, '[card number] ')
    .replace(CVC_RUN, '$1[redacted]');
}

interface Armed {
  token: string;
  /** callId → card parts already released on that call. */
  released: Map<string, { numberReads: number }>;
}
const armed = new Map<string, Armed>();

/** Called when the order call is placed: binds the vault token to this job. */
export function armOrderCard(jobId: string, token: string): void {
  armed.set(jobId, { token, released: new Map() });
}

export function disarmOrderCard(jobId: string): void {
  armed.delete(jobId);
}

export interface ReadCardDeps {
  vault: Pick<Vault, 'revealForCall' | 'last4'>;
  /** Roster phone for a vendorId; the card is read only on a call that the dialer placed to this number. */
  rosterPhone(vendorId: string): string | undefined;
  /** Audit hook: emit an event with last4 and the part released, never the value. */
  onRelease(e: { jobId: string; callId: string; vendorId: string; part: 'number' | 'expiry' | 'cvc'; last4: string }): void;
}

const MAX_NUMBER_READS = 3;
const digitsOnly = (s: string) => s.replace(/\D/g, '');

export function handleReadCard(job: Job, ctx: Pick<CallCtx, 'callId' | 'lane' | 'vendorId' | 'to'>, args: Record<string, unknown>, deps: ReadCardDeps): string {
  const refuse = (why: string) => `Do not read any card details. ${why}`;
  const a = armed.get(job.id);
  const best = job.bestDeal;
  if (!a || !best || job.state !== 'ORDERED') return refuse('There is no approved order to pay for. Say you will call back, and end the call.');
  if (ctx.lane !== 'supplier' || !ctx.vendorId || ctx.vendorId !== best.vendorId) return refuse('This is not the approved vendor. End the call politely.');
  const phone = deps.rosterPhone(ctx.vendorId);
  if (!phone || digitsOnly(phone).slice(-10) !== digitsOnly(ctx.to).slice(-10)) return refuse("This call isn't to the approved vendor's number. End the call politely.");

  const part = args.part === 'expiry' || args.part === 'cvc' ? args.part : 'number';
  const total = Number(args.totalQuoted);
  if (!Number.isFinite(total) || total <= 0) return refuse('First ask them for the total with shipping, then call read_card with that total.');
  if (total > best.landedTotal + 0.005) {
    return refuse(`They said ${money(total)}, which is over the approved ${money(best.landedTotal)}. Say you need to check with the customer, call record_order_result with placed false, and end the call.`);
  }
  const rel = a.released.get(ctx.callId) ?? { numberReads: 0 };
  if (part !== 'number' && rel.numberReads === 0) return refuse('Read the card number first, and only after they confirm the total.');
  if (part === 'number' && rel.numberReads >= MAX_NUMBER_READS) return refuse('The number has been read enough times. Offer to have the customer call them, and end the call.');

  const secret = deps.vault.revealForCall(a.token);
  const spoken = secret.use(({ pan, expMonth, expYear, cvv }) =>
    part === 'number' ? spokenGroups(pan) : part === 'expiry' ? `${expMonth} slash ${expYear.slice(-2)}` : cvv.split('').join(' '),
  );
  if (part === 'number') rel.numberReads++;
  a.released.set(ctx.callId, rel);
  deps.onRelease({ jobId: job.id, callId: ctx.callId, vendorId: ctx.vendorId, part, last4: deps.vault.last4(a.token) ?? '' });
  const label = part === 'number' ? 'The card number is' : part === 'expiry' ? 'The expiry is' : 'The security code is';
  return `${label}: ${spoken}. Read it exactly like that, slowly, then wait for them.`;
}

/** record_order_result: the vendor's confirmation is the moment the order exists. Returns what to say plus the event to emit. */
export function handleOrderResult(job: Job, ctx: Pick<CallCtx, 'callId' | 'vendorId'>, args: Record<string, unknown>, last4: string): { reply: string; event: Record<string, unknown> } {
  const placed = args.placed === true;
  const total = Number(args.total);
  const event = {
    status: placed ? 'placed' : 'not_placed',
    orderId: typeof args.orderNumber === 'string' && args.orderNumber ? args.orderNumber.slice(0, 40) : null,
    merchant: job.bestDeal?.supplier ?? ctx.vendorId,
    total: Number.isFinite(total) && total > 0 ? Math.round(total * 100) / 100 : job.bestDeal?.landedTotal ?? null,
    last4,
    channel: 'phone',
    callId: ctx.callId,
    reason: placed ? `Vendor confirmed the order by phone; paid with the card ending ${last4}` : 'Vendor did not place the order; nothing was charged that we know of',
  };
  disarmOrderCard(job.id);
  return { reply: placed ? 'Thank them, say goodbye, and end the call.' : 'Thank them, say the customer will be in touch, and end the call.', event };
}
