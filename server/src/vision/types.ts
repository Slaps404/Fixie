// Visual inspection ("Can I take a look?") — shared types for the tiered vision pipeline.
// Tier 1 runs in the browser (public/look/index.html), tier 2 ranks on the server, tier 3 extracts with Claude.

export type ImageKind = 'nameplate' | 'receipt' | 'part_label' | 'appliance' | 'other';
export const IMAGE_KINDS: ImageKind[] = ['nameplate', 'receipt', 'part_label', 'appliance', 'other'];

/** What the caller was asked to point the camera at. Drives the page prompt and the default goals. */
export type Ask = 'nameplate' | 'receipt' | 'part';

/** Facts the pipeline is trying to learn. The early-stop policy stops once every goal is confident. */
export type Goal = 'model' | 'purchaseDate' | 'partNumber';

/** Browser-side tier-1 scores (all 0..1). Absent for MMS uploads. */
export interface Tier1 {
  score: number;
  sharpness?: number;
  text?: number;
  glare?: number;
  stable?: boolean;
  manual?: boolean;
}

export interface VisionImage {
  id: string;
  source: 'camera' | 'mms' | 'upload';
  mime: string;
  /** The still sent to tier 3 (<= ~1600 px long edge from the camera page; MMS as received). */
  data: Buffer;
  /** Optional zoomed crop of the text region, sent to tier 3 alongside `data`. */
  crop?: { mime: string; data: Buffer };
  /** Optional small thumbnail for the cheap tier-2 classifier. Falls back to `data`. */
  thumb?: { mime: string; data: Buffer };
  tier1?: Tier1;
  /** Free-text context, e.g. the MMS body ("here's my receipt"). */
  caption?: string;
  receivedAt: number;
  /** Tier-2 output. */
  kind?: ImageKind;
  legibility?: number;
  rankedBy?: 'claude' | 'stub' | 'fast_path';
  /** Tier-3 attempted (success or not). */
  extracted?: boolean;
}

export interface Extraction {
  imageId: string;
  kind: ImageKind;
  fields: {
    brand?: string;
    model?: string;
    serial?: string;
    purchaseDate?: string; // YYYY-MM-DD
    store?: string;
    partNumbers?: string[];
  };
  /** Overall confidence after code-side validation (0..1). */
  confidence: number;
  /** Per-goal confidence after validation. */
  goalConfidence: Partial<Record<Goal, number>>;
  /** Code-side checks that moved confidence up or down. */
  checks: string[];
  by: 'claude' | 'stub';
  model?: string;
}

export interface KnownFact {
  value: string;
  confidence: number;
  imageId: string;
}

export interface Facts {
  brand?: KnownFact;
  model?: KnownFact;
  serial?: KnownFact;
  purchaseDate?: KnownFact;
  purchaseYear?: number;
  store?: KnownFact;
  partNumber?: KnownFact;
}

export interface VisionSession {
  code: string;
  jobId: string | null;
  /** Full E.164 caller number, for MMS matching. Never emitted unmasked. */
  phone?: string;
  ask: Ask;
  goals: Goal[];
  epoch: number;
  createdAt: number;
  expiresAt: number;
  images: VisionImage[];
  extractions: Extraction[];
  facts: Facts;
  tier2Calls: number;
  tier3Calls: number;
  status: 'waiting' | 'capturing' | 'working' | 'done';
  doneReason?: string;
  /** Camera page has been opened at least once. */
  opened: boolean;
  /** Pipeline bookkeeping (not serialized). */
  running?: boolean;
  rerun?: boolean;
  timer?: NodeJS.Timeout;
}
