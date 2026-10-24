// Code-side validation of tier-3 output. Confidence is computed in code, never taken from the LLM alone
// (same rule as Quote.identicalPart): format checks, date sanity, and a cross-check against the seeded parts catalog.
import { norm, parts } from '../parts.ts';
import type { PartInfo } from '../types.ts';
import type { Extraction, Facts, Goal, ImageKind, KnownFact } from './types.ts';

export interface RawExtraction {
  kind: ImageKind;
  legible: boolean;
  brand: string;
  model: string;
  serial: string;
  purchase_date: string;
  store: string;
  part_numbers: string[];
  model_confidence: number;
  date_confidence: number;
  part_confidence: number;
  notes?: string;
}

export interface ValidateCtx {
  symptom?: string;
  part?: PartInfo;
  now?: number;
}

const clamp01 = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0);
const clean = (s: unknown) => (typeof s === 'string' ? s.trim().replace(/\s+/g, ' ').slice(0, 80) : '');

/** Strip label words the model sometimes copies ("MODEL NO.", "M/N:"). */
export function cleanModel(s: string): string {
  return clean(s)
    .replace(/^(model|mod|m\/n|mdl)\s*(no\.?|number|#)?\s*[:.]?\s*/i, '')
    .replace(/\s+/g, '')
    .toUpperCase();
}

export function plausibleModel(m: string): boolean {
  const n = norm(m);
  return n.length >= 5 && n.length <= 20 && /[A-Z]/.test(n) && /\d/.test(n);
}

export function parseDate(s: string, now = Date.now()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(s));
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() + 1 !== Number(m[2])) return null;
  if (d.getUTCFullYear() < 1990 || d.getTime() > now + 86_400_000) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

export function validate(raw: RawExtraction, imageId: string, by: 'claude' | 'stub', ctx: ValidateCtx = {}, modelId?: string): Extraction {
  const checks: string[] = [];
  const goalConfidence: Partial<Record<Goal, number>> = {};
  const fields: Extraction['fields'] = {};
  const legiblePenalty = raw.legible ? 1 : 0.5;
  if (!raw.legible) checks.push('model said the text is hard to read (confidence halved)');

  const brand = clean(raw.brand);
  if (brand) fields.brand = brand;

  const model = cleanModel(raw.model);
  if (model) {
    let c = clamp01(raw.model_confidence) * legiblePenalty;
    if (!plausibleModel(model)) {
      checks.push(`"${model}" does not look like a model number (needs letters and digits, 5-20 chars)`);
      c = Math.min(c, 0.2);
    } else {
      const hit = parts.lookup(model, ctx.symptom || 'no heat');
      if (hit) {
        checks.push(`model matches seeded catalog (${hit.appliance}) → confidence ≥ 0.9`);
        c = Math.max(c, 0.9);
      }
    }
    fields.model = model;
    goalConfidence.model = round(c);
  }

  const serial = clean(raw.serial).replace(/\s+/g, '').toUpperCase();
  if (serial && norm(serial) !== norm(model)) fields.serial = serial;

  if (clean(raw.purchase_date)) {
    const d = parseDate(raw.purchase_date, ctx.now);
    if (d) {
      fields.purchaseDate = d;
      goalConfidence.purchaseDate = round(clamp01(raw.date_confidence) * legiblePenalty);
    } else {
      checks.push(`purchase date "${clean(raw.purchase_date)}" rejected (not a real past date)`);
    }
  }
  const store = clean(raw.store);
  if (store) fields.store = store;

  const pns = (Array.isArray(raw.part_numbers) ? raw.part_numbers : []).map((p) => clean(p).toUpperCase()).filter((p) => /\d/.test(p) && norm(p).length >= 5 && norm(p).length <= 16);
  if (pns.length) {
    fields.partNumbers = [...new Set(pns)].slice(0, 5);
    let c = clamp01(raw.part_confidence) * legiblePenalty;
    if (ctx.part && pns.some((p) => parts.isIdentical(p, ctx.part!))) {
      checks.push(`label matches the diagnosed part ${ctx.part.partNumber} → confidence ≥ 0.95`);
      c = Math.max(c, 0.95);
    }
    goalConfidence.partNumber = round(c);
  }

  const confidence = round(Math.max(0, ...Object.values(goalConfidence).map((v) => v ?? 0)));
  return { imageId, kind: raw.kind, fields, confidence, goalConfidence, checks, by, ...(modelId ? { model: modelId } : {}) };
}

/** Merge an extraction into the session facts, keeping the higher-confidence value per field. */
export function mergeFacts(facts: Facts, ex: Extraction): Facts {
  const put = (key: keyof Omit<Facts, 'purchaseYear'>, value: string | undefined, confidence: number) => {
    if (!value) return;
    const cur = facts[key] as KnownFact | undefined;
    if (!cur || confidence > cur.confidence) (facts as Record<string, KnownFact>)[key] = { value, confidence, imageId: ex.imageId };
  };
  const gc = ex.goalConfidence;
  put('model', ex.fields.model, gc.model ?? 0);
  put('brand', ex.fields.brand, Math.min(0.9, (gc.model ?? ex.confidence) || 0.5));
  put('serial', ex.fields.serial, gc.model ?? 0.5);
  put('purchaseDate', ex.fields.purchaseDate, gc.purchaseDate ?? 0);
  put('store', ex.fields.store, gc.purchaseDate ?? 0.5);
  put('partNumber', ex.fields.partNumbers?.[0], gc.partNumber ?? 0);
  if (facts.purchaseDate) facts.purchaseYear = Number(facts.purchaseDate.value.slice(0, 4));
  return facts;
}

const round = (n: number) => Math.round(n * 100) / 100;
