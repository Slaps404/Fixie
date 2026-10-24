import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config.ts';
import type { Parts } from './contracts.ts';
import type { PartInfo } from './types.ts';

interface SymptomRow {
  issue: string;
  confidence: number;
  partNumber: string;
}
interface Catalog {
  models: Record<string, { brand?: string; appliance: string; symptoms: Record<string, SymptomRow> }>;
  faultCodes: Record<string, SymptomRow>;
  parts: Record<string, PartInfo>;
}

function loadCatalog(): Catalog {
  try {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'parts.json'), 'utf8')) as Partial<Catalog>;
    return { models: raw.models ?? {}, faultCodes: raw.faultCodes ?? {}, parts: raw.parts ?? {} };
  } catch (err) {
    console.error('[parts] failed to load parts.json:', (err as Error).message);
    return { models: {}, faultCodes: {}, parts: {} };
  }
}

const catalog = loadCatalog();

/** Uppercase and strip everything but letters and digits. */
export const norm = (s: string | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

const SYMPTOM_KEYWORDS: Array<[string, RegExp]> = [
  ['no_heat', /heat|cold|warm|not dry|won'?t dry|isn'?t dry|wet|damp/i],
  ['no_start', /start|turn on|power|dead/i],
  ['no_spin', /spin|tumbl|drum/i],
  ['noisy', /nois|loud|squeal|thump|rattl/i],
  ['no_drain', /drain|water/i],
];

export function symptomKey(symptom: string): string | null {
  for (const [key, re] of SYMPTOM_KEYWORDS) if (re.test(symptom)) return key;
  return null;
}

function partFor(row: SymptomRow): PartInfo | null {
  return catalog.parts[row.partNumber] ?? null;
}

/** Catalog entry by exact part number (used when diagnosis names the part but the caller's model is unknown). */
export function partByNumber(partNumber: string | undefined): PartInfo | null {
  return partNumber ? (catalog.parts[partNumber] ?? null) : null;
}

export const parts: Parts = {
  lookup(model, symptom) {
    const m = norm(model);
    if (!m) return null;
    let bestKey: string | null = null;
    let bestDist = Infinity;
    for (const key of Object.keys(catalog.models)) {
      const d = levenshtein(m, norm(key));
      if (d < bestDist) {
        bestDist = d;
        bestKey = key;
      }
    }
    if (!bestKey || bestDist > 2) return null;
    const entry = catalog.models[bestKey];
    const sk = symptomKey(symptom ?? '');
    let row = sk ? entry.symptoms[sk] : undefined;
    let confidence = row?.confidence ?? 0;
    if (!row) {
      // Unrecognized symptom on a model with a single known failure: offer it with a lower prior.
      const rows = Object.values(entry.symptoms);
      if (rows.length !== 1) return null;
      row = rows[0];
      confidence = Math.round(row.confidence * 0.6 * 100) / 100;
    }
    const part = partFor(row);
    if (!part) return null;
    return { appliance: entry.appliance, issue: row.issue, confidence, part };
  },

  byFault(code) {
    const c = norm(code);
    if (!c) return null;
    const key = Object.keys(catalog.faultCodes).find((k) => norm(k) === c);
    if (!key) return null;
    const row = catalog.faultCodes[key];
    const part = partFor(row);
    if (!part) return null;
    return { issue: row.issue, confidence: row.confidence, part };
  },

  isIdentical(partNumberSaid, part) {
    const said = norm(partNumberSaid);
    if (!said || !part) return false;
    const accepted = new Set<string>();
    for (const ref of [part.partNumber, ...(part.crossRefs ?? [])]) {
      const n = norm(ref);
      if (!n) continue;
      accepted.add(n);
      accepted.add(n.startsWith('WP') ? n.slice(2) : `WP${n}`);
    }
    return accepted.has(said);
  },
};
