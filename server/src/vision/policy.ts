// Pure decision logic for the vision pipeline: tier-2 priority ranking and the tier-3 early-stop policy.
// No I/O here, so it is unit-tested directly (test/vision.test.ts).
import type { Facts, Goal, ImageKind, VisionImage } from './types.ts';

/** A goal counts as known once its confidence reaches this. */
export const CONFIDENT = Number(process.env.VISION_CONFIDENT) || 0.85;
/** Hard cap on expensive tier-3 calls per session. */
export const TIER3_BUDGET = Number(process.env.VISION_TIER3_BUDGET) || 4;
/** Images below this tier-2 legibility are never sent to tier 3. */
export const MIN_LEGIBILITY = 0.25;
/** After this many failed tier-3 attempts on one kind, stop trying that kind (ask for a better photo instead). */
export const MAX_FAILS_PER_KIND = 2;

/** Which goals each image kind can answer, strongest first. */
export const KIND_GOALS: Record<ImageKind, Goal[]> = {
  nameplate: ['model'],
  receipt: ['purchaseDate'],
  part_label: ['partNumber'],
  // A wide appliance shot sometimes shows the model badge, but it is a weak source.
  appliance: ['model'],
  other: [],
};

/** Base value of a kind when it answers an open goal. The nameplate is the key: it unlocks the parts lookup. */
export const KIND_WEIGHT: Record<ImageKind, number> = {
  nameplate: 1.0,
  receipt: 0.8,
  part_label: 0.7,
  appliance: 0.25,
  other: 0.05,
};

export function openGoals(goals: Goal[], facts: Facts): Goal[] {
  return goals.filter((g) => (facts[g]?.confidence ?? 0) < CONFIDENT);
}

/** Tier-2 priority: kind weight × does it answer an open goal × legibility, with tier-1 score as a tie-breaker. */
export function priority(img: VisionImage, open: Goal[]): number {
  const kind = img.kind ?? 'other';
  const answers = KIND_GOALS[kind].some((g) => open.includes(g));
  const need = answers ? 1 : 0.1;
  const leg = img.legibility ?? img.tier1?.score ?? 0.5;
  return KIND_WEIGHT[kind] * need * (0.3 + 0.7 * leg) + 0.01 * (img.tier1?.score ?? 0);
}

export interface RankEntry {
  imageId: string;
  kind: ImageKind;
  legibility: number;
  priority: number;
}

export function rankImages(images: VisionImage[], goals: Goal[], facts: Facts): RankEntry[] {
  const open = openGoals(goals, facts);
  return images
    .map((img) => ({
      imageId: img.id,
      kind: img.kind ?? 'other',
      legibility: round(img.legibility ?? img.tier1?.score ?? 0.5),
      priority: round(priority(img, open)),
      at: img.receivedAt,
    }))
    .sort((a, b) => b.priority - a.priority || b.at - a.at)
    .map(({ at: _at, ...r }) => r);
}

/** Deterministic one-line reason for the board, e.g. "nameplate first (needs model) · receipt next (needs purchase date) · 2 skipped". */
export function rankReason(order: RankEntry[], goals: Goal[], facts: Facts): string {
  const open = openGoals(goals, facts);
  if (!order.length) return 'No images yet.';
  const useful = order.filter((r) => KIND_GOALS[r.kind].some((g) => open.includes(g)) && r.legibility >= MIN_LEGIBILITY);
  const parts = useful.slice(0, 3).map((r, i) => `${r.kind} ${i === 0 ? 'first' : 'next'} (${KIND_GOALS[r.kind].filter((g) => open.includes(g)).map(goalLabel).join(', ')}, legibility ${r.legibility.toFixed(2)})`);
  const skipped = order.length - useful.length;
  if (!parts.length) return `Nothing here answers ${open.map(goalLabel).join(' / ') || 'any open question'}; ${order.length} image(s) held back from the expensive model.`;
  return parts.join(' · ') + (skipped ? ` · ${skipped} held back (blurry or not useful)` : '');
}

export type NextStep =
  | { action: 'extract'; imageId: string; reason: string }
  | { action: 'stop'; reason: string; code: 'goals_met' | 'budget' | 'nothing_useful' | 'no_images' };

/**
 * Early-stop policy. Walk the ranked list; send the best image that can still answer an open goal.
 * Stop as soon as every goal is confident, the tier-3 budget is spent, or nothing left can help.
 */
export function nextStep(
  ranked: RankEntry[],
  images: VisionImage[],
  goals: Goal[],
  facts: Facts,
  tier3Calls: number,
  failsByKind: Partial<Record<ImageKind, number>> = {},
  budget = TIER3_BUDGET,
): NextStep {
  const open = openGoals(goals, facts);
  const pending = ranked.filter((r) => !images.find((i) => i.id === r.imageId)?.extracted);
  if (!open.length) {
    return { action: 'stop', code: 'goals_met', reason: `Early stop: ${goals.map(goalLabel).join(' + ')} confident (≥${CONFIDENT}). Skipped ${pending.length} image(s), saving ${pending.length} expensive call(s).` };
  }
  if (tier3Calls >= budget) {
    return { action: 'stop', code: 'budget', reason: `Tier-3 budget spent (${tier3Calls}/${budget} calls). Still missing: ${open.map(goalLabel).join(', ')}.` };
  }
  if (!images.length) return { action: 'stop', code: 'no_images', reason: 'No images yet.' };

  const helps = (r: RankEntry) => KIND_GOALS[r.kind].some((g) => open.includes(g));
  const strong = pending.filter((r) => helps(r) && r.legibility >= MIN_LEGIBILITY && (failsByKind[r.kind] ?? 0) < MAX_FAILS_PER_KIND);
  // Only fall back to weak "appliance" shots when no dedicated source (nameplate/receipt/label) is left.
  const pick = strong.find((r) => r.kind !== 'appliance') ?? strong[0];
  if (!pick) {
    return { action: 'stop', code: 'nothing_useful', reason: `No remaining image can answer ${open.map(goalLabel).join(' / ')}. ${pending.length} held back.` };
  }
  const answers = KIND_GOALS[pick.kind].filter((g) => open.includes(g)).map(goalLabel).join(', ');
  return { action: 'extract', imageId: pick.imageId, reason: `Sending ${pick.kind} ${pick.imageId} to the vision model for ${answers} (priority ${pick.priority.toFixed(2)}).` };
}

export function goalLabel(g: Goal): string {
  return g === 'model' ? 'model number' : g === 'purchaseDate' ? 'purchase date' : 'part number';
}

const round = (n: number) => Math.round(n * 1000) / 1000;
