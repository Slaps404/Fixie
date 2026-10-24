// Pure Bayesian diagnosis over a hand-written fault tree (#11).
// Likelihoods are expert-written, not learned. No I/O except loadFaultTree().
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Hypothesis {
  id: string;
  name: string;
  short: string;
  prior: number;
  partNumber?: string;
}

export interface FaultTest {
  id: string;
  label: string;
  /** Spoken instruction, short enough for a senior on the phone. */
  prompt: string;
  outcomes: string[];
  /** likelihood[outcome][hypothesis] = P(outcome | hypothesis) */
  likelihood: Record<string, Record<string, number>>;
  /** 0 = look/listen, 1 = unplugged meter test. */
  safetyCost: number;
  requiresAck: string[];
  needsMeter: boolean;
}

export interface FaultTree {
  id: string;
  appliance: string;
  symptom: string;
  note?: string;
  hypotheses: Hypothesis[];
  tests: FaultTest[];
}

export const UNKNOWN = 'unknown';

/** Same shape as Job.diagnosis in types.ts. */
export interface DiagnosisState {
  faultTree: string;
  observations: Record<string, string>;
  unknowns: number;
  posterior: Record<string, number>;
  /** Unclear readings per test id. Kept apart from `observations` so an unclear test can be asked again. */
  unknownTests?: Record<string, number>;
}

const FAULT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'faults');
const cache = new Map<string, FaultTree>();

export function loadFaultTree(id: string): FaultTree {
  if (!/^[a-z0-9_]+$/i.test(id)) throw new Error(`invalid fault tree id: ${id}`);
  let tree = cache.get(id);
  if (!tree) {
    tree = JSON.parse(readFileSync(join(FAULT_DIR, `${id}.json`), 'utf8')) as FaultTree;
    cache.set(id, tree);
  }
  return tree;
}

function normalize(p: Record<string, number>): Record<string, number> {
  const sum = Object.values(p).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(p)) out[k] = sum > 0 ? v / sum : 0;
  return out;
}

function priors(tree: FaultTree): Record<string, number> {
  return normalize(Object.fromEntries(tree.hypotheses.map((h) => [h.id, h.prior])));
}

function update(post: Record<string, number>, test: FaultTest, outcome: string): Record<string, number> {
  const lik = test.likelihood[outcome];
  if (!lik) return post;
  const next = normalize(Object.fromEntries(Object.entries(post).map(([h, p]) => [h, p * (lik[h] ?? 0)])));
  // Impossible evidence (all zero): keep the old belief rather than NaN/zeros.
  return Object.values(next).some((v) => v > 0) ? next : post;
}

export function initialState(tree: FaultTree): DiagnosisState {
  return { faultTree: tree.id, observations: {}, unknowns: 0, posterior: priors(tree) };
}

type Rule = [outcome: string, pattern: RegExp];

const BEEP_NEG = /\b(no|not|nothing|never|without|doesn'?t|does not|didn'?t|did not|won'?t|isn'?t|is not|zero)\b.*\b(beep\w*|continuity|sound|noise|tone|buzz\w*)\b/;

/** Continuity test said aloud: beep = closed, silent = open. Order matters; first match wins. */
const CONTINUITY_RULES: Rule[] = [
  ['closed', /\b(not|isn'?t|is not|never)\s+(silent|open|dead|blown|bad|broken)\b/],
  ['open', BEEP_NEG],
  ['open', /\b(silent|silence|quiet|open|ol|o\.l|infinite|infinity|overload|dead|blown|bad|broken|failed|no|nope|nothing|negative)\b/],
  ['closed', /\b(beep\w*|continuity|closed|good|fine|ok|okay|yes|yeah|yep|yup|positive|buzz\w*|tone|sound|sounds|short|shorted|connected|passes|pass|passed|zero|0)\b/],
];

/** Per-test synonym rules over the normalized spoken phrase. Exact outcome ids are always tried first. */
const READING_RULES: Record<string, Rule[]> = {
  breaker_check: [
    ['tripped', /\b(not|aren'?t|isn'?t|none|neither)\s+(on|fine|ok|okay|good)\b/],
    ['ok', /\b(not|none|neither|no)\s+(tripped|off|flipped)\b/],
    ['tripped', /\b(tripped|trip|off|flipped|down|one is off|one off|popped|no|nope)\b/],
    ['ok', /\b(ok|okay|on|both|all|yes|yeah|yep|yup|fine|good|normal|up|checked|switched)\b/],
  ],
  drum_spins: [
    ['no', /\b(no|nope|not|doesn'?t|does not|won'?t|stuck|stopped|silent|seized|jammed|nothing|stationary|isn'?t|is not|never)\b/],
    ['yes', /\b(yes|yeah|yep|yup|spin\w*|turn\w*|tumbl\w*|rotat\w*|normal\w*|fine|works|working|runs|running|moves|moving|good|ok|okay)\b/],
  ],
  any_warmth: [
    ['none', /\b(none|cold|cool|nothing|no|nope|zero|not|isn'?t|is not|doesn'?t|room temperature|ambient|unheated)\b/],
    ['some', /\b(some|warm\w*|hot|lukewarm|little|slight\w*|bit|yes|yeah|yep|yup|mild\w*|heat\w*|tepid)\b/],
  ],
  fuse_continuity: CONTINUITY_RULES,
  thermostat_continuity: CONTINUITY_RULES,
  element_continuity: [
    ['ok', /\b(not|isn'?t|is not|never)\s+(open|ol|infinite|dead|blown|bad|broken)\b/],
    ['open', /\b(open|ol|o\.l|infinite|infinity|overload|dead|blown|bad|broken|failed|no|nope|nothing|silent|negative|no reading|no continuity)\b/],
    ['ok', /\b(ok|okay|good|fine|normal|about ten|around ten|ten|yes|yeah|yep|yup|beep\w*|continuity|reads|passes)\b/],
  ],
};

function normalizeReading(reading: string): string {
  return String(reading ?? '')
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[^a-z0-9.' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a raw reading (outcome id, synonym, or spoken phrase) to one of the test's outcomes, else 'unknown'. */
export function resolveReading(test: FaultTest, reading: string): string {
  const r = normalizeReading(reading);
  if (!r || r === UNKNOWN) return UNKNOWN;
  if (test.outcomes.includes(r)) return r;
  // Meter tests: a bare number near a healthy coil resistance (about ten ohms) is a good element.
  if (test.id === 'element_continuity') {
    const m = r.match(/^(?:about |around |roughly )?(\d+(?:\.\d+)?)(?: ?ohms?)?$/);
    if (m) {
      const n = Number(m[1]);
      if (n >= 3 && n <= 40) return 'ok';
    }
  }
  for (const [outcome, re] of READING_RULES[test.id] ?? []) {
    if (test.outcomes.includes(outcome) && re.test(r)) return outcome;
  }
  return UNKNOWN;
}

/** Returns a new state. 'unknown' (or any unrecognized reading) leaves the posterior and observations alone and counts as an unknown. */
export function observe(state: DiagnosisState, tree: FaultTree, test: FaultTest | string, reading: string): DiagnosisState {
  const t = typeof test === 'string' ? tree.tests.find((x) => x.id === test) : test;
  if (!t) throw new Error(`unknown test: ${String(test)}`);
  const outcome = resolveReading(t, reading);
  if (outcome === UNKNOWN) {
    const unknownTests = { ...(state.unknownTests ?? {}), [t.id]: (state.unknownTests?.[t.id] ?? 0) + 1 };
    return { ...state, unknowns: state.unknowns + 1, unknownTests, posterior: { ...state.posterior } };
  }
  const observations = { ...state.observations, [t.id]: outcome };
  // Re-observing a test replaces its earlier reading rather than double counting.
  let post = priors(tree);
  for (const [id, o] of Object.entries(observations)) {
    const ot = tree.tests.find((x) => x.id === id);
    if (ot && o !== UNKNOWN) post = update(post, ot, o);
  }
  return { ...state, observations, posterior: post };
}

export function posterior(state: DiagnosisState): Record<string, number> {
  return { ...state.posterior };
}

function entropy(p: Record<string, number>): number {
  let h = 0;
  for (const v of Object.values(p)) if (v > 0) h -= v * Math.log2(v);
  return h;
}

/** Expected reduction in entropy (bits) from running `test` now. */
export function expectedInfoGain(state: DiagnosisState, tree: FaultTree, test: FaultTest | string): number {
  const t = typeof test === 'string' ? tree.tests.find((x) => x.id === test) : test;
  if (!t) return 0;
  let expected = 0;
  for (const o of t.outcomes) {
    const lik = t.likelihood[o] ?? {};
    let pO = 0;
    for (const h of tree.hypotheses) pO += (state.posterior[h.id] ?? 0) * (lik[h.id] ?? 0);
    if (pO <= 0) continue;
    expected += pO * entropy(update(state.posterior, t, o));
  }
  return Math.max(0, entropy(state.posterior) - expected);
}

/** Best unobserved, permitted test by info gain per (1 + safetyCost); null if none qualifies. */
export function nextTest(
  state: DiagnosisState,
  tree: FaultTree,
  opts: { acks?: string[]; hasMeter?: boolean } = {},
): FaultTest | null {
  // Two unclear readings in total means testing has stopped (the orchestrator escalates to a pro).
  if (state.unknowns >= 2) return null;
  const acks = new Set(opts.acks ?? []);
  let best: FaultTest | null = null;
  let bestScore = -Infinity;
  for (const t of tree.tests) {
    if (t.id in state.observations) continue;
    // An unclear test may be asked once more, never a third time.
    if ((state.unknownTests?.[t.id] ?? 0) >= 2) continue;
    if (t.needsMeter && !opts.hasMeter) continue;
    if (!t.requiresAck.every((a) => acks.has(a))) continue;
    const score = expectedInfoGain(state, tree, t) / (1 + t.safetyCost);
    if (score > bestScore + 1e-12) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

export function topHypothesis(state: DiagnosisState): { id: string; p: number } {
  let id = '';
  let p = -1;
  for (const [h, v] of Object.entries(state.posterior)) {
    if (v > p) {
      id = h;
      p = v;
    }
  }
  return { id, p: Math.max(p, 0) };
}

export function isConfident(state: DiagnosisState, threshold = 0.85): boolean {
  return topHypothesis(state).p >= threshold;
}

/** Deterministic one-line explanation, e.g. "Fuse open → P(fuse) 0.45→0.97". Never LLM-written. */
export function reasonFor(prev: DiagnosisState, next: DiagnosisState, test: FaultTest, reading: string): string {
  const outcome = next.observations[test.id] ?? UNKNOWN;
  if (next.unknowns > prev.unknowns || outcome === UNKNOWN) {
    return `${test.label} reading unclear (${String(reading).trim() || 'blank'}) → no change, unknowns ${next.unknowns}`;
  }
  // Report the hypothesis whose probability moved the most.
  let hid = topHypothesis(next).id;
  let delta = -1;
  for (const [h, v] of Object.entries(next.posterior)) {
    const d = Math.abs(v - (prev.posterior[h] ?? 0));
    if (d > delta + 1e-12) {
      hid = h;
      delta = d;
    }
  }
  const short = loadFaultTree(next.faultTree).hypotheses.find((h) => h.id === hid)?.short ?? hid.replace(/_/g, ' ');
  return `${test.label} ${outcome} → P(${short}) ${(prev.posterior[hid] ?? 0).toFixed(2)}→${(next.posterior[hid] ?? 0).toFixed(2)}`;
}
