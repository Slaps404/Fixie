// Tier 2 (cheap classifier) and tier 3 (vision extractor) model calls.
// Claude when ANTHROPIC_API_KEY is set; otherwise a deterministic stub so tests and DRY_RUN rehearsals work offline.
import Anthropic from '@anthropic-ai/sdk';
import { IMAGE_KINDS } from './types.ts';
import type { Ask, ImageKind, VisionImage } from './types.ts';
import type { RawExtraction } from './validate.ts';

/** Tier 2: fast and cheap. Sees small thumbnails only. */
export const TIER2_MODEL = process.env.VISION_TIER2_MODEL ?? 'claude-haiku-5-5';
/** Tier 3: stronger vision model for reading small print. Effort "low" keeps mid-call latency down. */
export const TIER3_MODEL = process.env.VISION_TIER3_MODEL ?? 'claude-opus-5-5';

export interface Classification {
  kind: ImageKind;
  legibility: number;
}

export interface VisionModel {
  name: 'claude' | 'stub';
  classify(images: VisionImage[], ask: Ask): Promise<Classification[]>;
  extract(image: VisionImage, ctx: { appliance?: string }): Promise<RawExtraction | null>;
}

const SUPPORTED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
export const supportedMime = (m: string) => SUPPORTED.has(m.toLowerCase().split(';')[0].trim());
const mediaType = (m: string) => m.toLowerCase().split(';')[0].trim() as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

// ---------------------------------------------------------------- stub

const KIND_FROM_TEXT: Array<[RegExp, ImageKind]> = [
  [/receipt|invoice|bought|purchase/i, 'receipt'],
  [/sticker|model|serial|nameplate|plate|tag|rating/i, 'nameplate'],
  [/part|fuse|label|box|package/i, 'part_label'],
  [/dryer|washer|appliance|machine/i, 'appliance'],
];
const ASK_KIND: Record<Ask, ImageKind> = { nameplate: 'nameplate', receipt: 'receipt', part: 'part_label' };

/** Deterministic: kind from the caption, else from tier-1 text score + what was asked. Legibility from tier 1. */
export function stubClassify(img: VisionImage, ask: Ask): Classification {
  const text = img.caption ?? '';
  let kind: ImageKind | undefined;
  for (const [re, k] of KIND_FROM_TEXT) if (re.test(text)) { kind = k; break; }
  if (!kind) kind = img.tier1 ? ((img.tier1.text ?? img.tier1.score) >= 0.3 ? ASK_KIND[ask] : 'appliance') : ASK_KIND[ask];
  let legibility = img.tier1?.score ?? 0.6;
  if (/blur/i.test(text)) legibility = 0.1;
  if (!supportedMime(img.mime)) legibility = 0;
  return { kind, legibility: Math.round(legibility * 1000) / 1000 };
}

/** Canned readings for the seeded dryer demo. Every stub event is flagged simulated on the board. */
export function stubExtract(img: VisionImage): RawExtraction {
  const base: RawExtraction = { kind: img.kind ?? 'other', legible: true, brand: '', model: '', serial: '', purchase_date: '', store: '', part_numbers: [], model_confidence: 0, date_confidence: 0, part_confidence: 0 };
  const leg = img.legibility ?? 0.6;
  const conf = leg < 0.35 ? 0.4 : 0.92;
  switch (img.kind) {
    case 'nameplate':
      return { ...base, legible: leg >= 0.35, brand: 'Whirlpool', model: 'WED4815EW', serial: 'C91234567', model_confidence: conf };
    case 'receipt':
      return { ...base, legible: leg >= 0.35, store: 'Home Depot', purchase_date: '2019-06-14', date_confidence: conf };
    case 'part_label':
      return { ...base, legible: leg >= 0.35, part_numbers: ['WP3392519'], part_confidence: conf };
    case 'appliance':
      return { ...base, brand: 'Whirlpool', model_confidence: 0 };
    default:
      return base;
  }
}

export const stubModel: VisionModel = {
  name: 'stub',
  async classify(images, ask) {
    return images.map((i) => stubClassify(i, ask));
  },
  async extract(image) {
    return stubExtract(image);
  },
};

// ---------------------------------------------------------------- Claude

const CLASSIFY_SCHEMA = {
  type: 'object',
  properties: {
    images: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          kind: { type: 'string', enum: IMAGE_KINDS },
          legibility: { type: 'number' },
        },
        required: ['index', 'kind', 'legibility'],
        additionalProperties: false,
      },
    },
  },
  required: ['images'],
  additionalProperties: false,
} as const;

// Empty string / 0 mean "not visible" (avoids nullable unions in the schema).
const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: IMAGE_KINDS },
    legible: { type: 'boolean' },
    brand: { type: 'string' },
    model: { type: 'string' },
    serial: { type: 'string' },
    purchase_date: { type: 'string' },
    store: { type: 'string' },
    part_numbers: { type: 'array', items: { type: 'string' } },
    model_confidence: { type: 'number' },
    date_confidence: { type: 'number' },
    part_confidence: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['kind', 'legible', 'brand', 'model', 'serial', 'purchase_date', 'store', 'part_numbers', 'model_confidence', 'date_confidence', 'part_confidence', 'notes'],
  additionalProperties: false,
} as const;

const CLASSIFY_PROMPT = `You triage photos a caller took of a broken home appliance. For each image, return:
- kind: "nameplate" (model/serial rating sticker or plate), "receipt" (store receipt or invoice), "part_label" (a replacement part or its packaging with a printed part number), "appliance" (the machine itself, no readable label), or "other".
- legibility: 0 to 1, how readable the printed text is at full resolution (0 = no text or unreadable, 1 = crisp).
Judge only what is visible. Do not read out the text.`;

const EXTRACT_PROMPT = `Read the printed text in this photo from a caller's appliance repair. Copy characters exactly as printed; never guess or complete a number you cannot see. Use "" for anything not visible and 0 for its confidence.
- Nameplate/rating sticker: brand, model (the value after MODEL / MOD / M/N, without the label word), serial (after SERIAL / S/N). model_confidence = how sure you are every character of the model is right.
- Receipt: store = the store or chain name only (e.g. "Home Depot"), no address or store number; purchase_date as YYYY-MM-DD. date_confidence likewise. Leave model empty unless it is a nameplate.
- Part label: part_numbers as printed. part_confidence likewise.
Set legible=false if glare, blur or angle makes any of those characters uncertain. If two images are given, the second is a zoomed crop of the first.`;

function imageBlock(mime: string, data: Buffer) {
  return { type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType(mime), data: data.toString('base64') } };
}

function firstText(content: Array<{ type: string; text?: string }>): string {
  for (const b of content) if (b.type === 'text' && typeof b.text === 'string') return b.text;
  return '';
}

export function claudeModel(apiKey: string): VisionModel {
  const client = new Anthropic({ apiKey, maxRetries: 1 });
  return {
    name: 'claude',
    async classify(images, ask) {
      const usable = images.map((img, index) => ({ img, index })).filter(({ img }) => supportedMime(img.thumb?.mime ?? img.mime));
      const out: Classification[] = images.map((img) => (supportedMime(img.mime) ? stubClassify(img, ask) : { kind: 'other', legibility: 0 }));
      if (!usable.length) return out;
      const content: Anthropic.ContentBlockParam[] = [];
      for (const { img, index } of usable) {
        content.push({ type: 'text', text: `Image ${index}${img.caption ? ` (caller wrote: "${img.caption.slice(0, 120)}")` : ''}:` });
        const t = img.thumb ?? { mime: img.mime, data: img.data };
        content.push(imageBlock(t.mime, t.data));
      }
      content.push({ type: 'text', text: `${CLASSIFY_PROMPT}\nThe caller was asked to show: ${ask}.` });
      const res = await client.messages.create(
        {
          model: TIER2_MODEL,
          max_tokens: 2048,
          output_config: { effort: 'low', format: { type: 'json_schema', schema: CLASSIFY_SCHEMA as unknown as Record<string, unknown> } },
          messages: [{ role: 'user', content }],
        },
        { timeout: 15_000 },
      );
      if (res.stop_reason === 'refusal') throw new Error('tier-2 classifier declined');
      const parsed = JSON.parse(firstText(res.content as Array<{ type: string; text?: string }>) || '{}') as { images?: Array<{ index: number; kind: ImageKind; legibility: number }> };
      for (const r of parsed.images ?? []) {
        if (!Number.isInteger(r.index) || r.index < 0 || r.index >= images.length) continue;
        if (!IMAGE_KINDS.includes(r.kind)) continue;
        out[r.index] = { kind: r.kind, legibility: Math.max(0, Math.min(1, Number(r.legibility) || 0)) };
      }
      return out;
    },

    async extract(image, ctx) {
      if (!supportedMime(image.mime)) return null;
      const content: Anthropic.Beta.BetaContentBlockParam[] = [imageBlock(image.mime, image.data)];
      if (image.crop && supportedMime(image.crop.mime)) content.push(imageBlock(image.crop.mime, image.crop.data));
      content.push({ type: 'text', text: `${EXTRACT_PROMPT}${ctx.appliance ? `\nThe appliance is a ${ctx.appliance}.` : ''}${image.kind ? `\nA triage model thinks this is a ${image.kind}.` : ''}` });
      const res = await client.beta.messages.create(
        {
          model: TIER3_MODEL,
          max_tokens: 4096,
          // Server-side fallback re-runs a classifier decline on Anthropic's recommended model instead of failing.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'low', format: { type: 'json_schema', schema: EXTRACT_SCHEMA as unknown as Record<string, unknown> } },
          messages: [{ role: 'user', content }],
        },
        { timeout: 25_000 },
      );
      if (res.stop_reason === 'refusal') return null;
      const text = firstText(res.content as Array<{ type: string; text?: string }>);
      if (!text) return null;
      return JSON.parse(text) as RawExtraction;
    },
  };
}

let cached: VisionModel | null = null;
/** Claude if a key is configured (and VISION_STUB != 1), else the stub. */
export function visionModel(): VisionModel {
  if (cached) return cached;
  const key = process.env.ANTHROPIC_API_KEY ?? '';
  cached = key && process.env.VISION_STUB !== '1' ? claudeModel(key) : stubModel;
  return cached;
}
export function setVisionModel(m: VisionModel | null): void {
  cached = m;
}
