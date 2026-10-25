import rawCalls from "./calls.json";

export const FPS = 30;

export type Who = "agent" | "other";
type Turn = { who: Who; t: number; dur: number; text: string };
export type Call = {
  id: string;
  lane: string;
  party: string | null;
  phone: string | null;
  startedAt: string;
  durationSec: number;
  peaks: { rate: number; agent: number[]; other: number[] };
  turns: Turn[];
};
export const CALLS = rawCalls as unknown as Record<string, Call>;

const ID = {
  intake: "01a17060-ac7f-7001-93f5-93412da4024c",
  warranty: "01a17061-8203-7001-9403-cad64c735b86",
  valley: "01a17061-8624-7cc7-a29b-78aa94ad2b78",
  partsDirect: "01a17061-863d-7001-81ae-3e7aba52bd8e",
  callback: "01a1702d-19e6-7001-a6a8-38a1269e8de0",
  delivery: "01a17037-8b4a-7001-813e-6c04554edbba",
  smoke: "01a17064-2f2a-7000-bea9-8525327c8ff2",
} as const;

/** A cut from one recording, in seconds from the recording's start. */
export type Seg = { from: number; to: number };

export type Overlay =
  | { kind: "diagnosis"; at: number }
  | { kind: "guard"; at: number; title: string; detail: string }
  | { kind: "card"; at: number; title: string; detail: string }
  | { kind: "stop"; at: number; title: string; detail: string }
  | { kind: "whatsapp"; at: number; text: string };

/** `at` on overlays is seconds into the beat, after cuts are joined. */
export type Beat =
  | { kind: "title"; seconds: number; kicker: string; title: string; sub?: string }
  | { kind: "end"; seconds: number }
  | {
      kind: "clip";
      call: string;
      label: string;
      who: { agent: string; other: string };
      segs: Seg[];
      hold?: number;
      overlay?: Overlay;
    }
  | {
      kind: "parallel";
      calls: Array<{ id: string; name: string }>;
      /** Window of real wall-clock time: seconds after the first call started. */
      from: number;
      to: number;
    };

const DOROTHY = { agent: "Fixie", other: "Dorothy" };

const callback: Beat = {
  kind: "clip",
  call: ID.callback,
  label: "Fixie calls Dorothy back",
  who: DOROTHY,
  segs: [{ from: 18.8, to: 25.7 }],
  hold: 1.6,
  overlay: { kind: "card", at: 6.6, title: "Virtual card capped at $15", detail: "1¢ over and the bank declines it" },
};

const coaching: Beat = {
  kind: "clip",
  call: ID.delivery,
  label: "The part arrives. Fixie coaches the install.",
  who: DOROTHY,
  segs: [
    { from: 82.6, to: 85.5 },
    { from: 90.8, to: 95.6 },
  ],
  hold: 0.4,
};

const smokeLong: Beat = {
  kind: "clip",
  call: ID.smoke,
  label: "Mid-install, something goes wrong",
  who: DOROTHY,
  segs: [
    { from: 152.0, to: 155.0 },
    { from: 158.1, to: 160.3 },
    { from: 197.2, to: 202.6 },
  ],
  hold: 1.2,
  overlay: { kind: "stop", at: 4.6, title: "Knows when to stop", detail: "Install halted. Sent to a licensed pro." },
};

const smokeShort: Beat = {
  ...smokeLong,
  segs: [
    { from: 152.0, to: 155.0 },
    { from: 158.1, to: 160.3 },
    { from: 200.0, to: 202.6 },
  ],
  hold: 0.6,
};

const warm = (hold: number): Beat => ({
  kind: "clip",
  call: ID.delivery,
  label: "Fixed",
  who: DOROTHY,
  segs: [
    { from: 181.7, to: 183.6 },
    { from: 184.9, to: 186.8 },
  ],
  hold,
  overlay: { kind: "whatsapp", at: 3.4, text: "Your dryer is fixed 🎉 Keep that vent clear of lint." },
});

/** Stage montage (M key on /admin/demo): follows the live call and the phones ringing in the room. */
export const STAGE: Beat[] = [callback, coaching, smokeLong, warm(2.6)];

/** Submission video, at most 60 s: the whole loop, condensed. */
export const SUBMISSION: Beat[] = [
  { kind: "title", seconds: 3, kicker: "Recorded live tonight", title: "Dorothy’s dryer runs cold.", sub: "She calls one number." },
  {
    kind: "clip",
    call: ID.intake,
    label: "Dorothy calls Fixie",
    who: DOROTHY,
    segs: [
      { from: 18.3, to: 22.6 },
      { from: 42.8, to: 47.9 },
    ],
    hold: 0.3,
    overlay: { kind: "diagnosis", at: 3.9 },
  },
  {
    kind: "parallel",
    calls: [
      { id: ID.warranty, name: "Whirlpool warranty line" },
      { id: ID.valley, name: "Valley Appliance Parts" },
      { id: ID.partsDirect, name: "PartsDirect Counter" },
    ],
    from: 9.5,
    to: 16.5,
  },
  {
    kind: "clip",
    call: ID.valley,
    label: "Valley Appliance Parts",
    who: { agent: "Fixie", other: "Valley" },
    segs: [{ from: 16.9, to: 21.0 }],
    hold: 1.2,
    overlay: { kind: "guard", at: 3.6, title: "Over budget, rejected by code", detail: "$55 + $4 shipping = $59 > $40 cap" },
  },
  callback,
  coaching,
  smokeShort,
  warm(1.4),
  { kind: "end", seconds: 5 },
];

export const beatSeconds = (b: Beat): number => {
  if (b.kind === "title" || b.kind === "end") return b.seconds;
  if (b.kind === "parallel") return b.to - b.from;
  return b.segs.reduce((s, g) => s + g.to - g.from, 0) + (b.hold ?? 0);
};
export const beatFrames = (b: Beat) => Math.round(beatSeconds(b) * FPS);
export const totalFrames = (beats: Beat[]) => beats.reduce((s, b) => s + beatFrames(b), 0);

/** Wall-clock offset of each call in a parallel beat, relative to the first to start. */
export function offsets(ids: string[]): number[] {
  const starts = ids.map((id) => Date.parse(CALLS[id].startedAt));
  const first = Math.min(...starts);
  return starts.map((s) => (s - first) / 1000);
}

/** Maps beat time to recording time across joined cuts. */
export function toRecording(segs: Seg[], beatT: number): { rec: number; seg: number } {
  let acc = 0;
  for (let i = 0; i < segs.length; i++) {
    const len = segs[i].to - segs[i].from;
    if (beatT < acc + len || i === segs.length - 1) return { rec: segs[i].from + Math.min(beatT - acc, len), seg: i };
    acc += len;
  }
  return { rec: segs[0].from, seg: 0 };
}

export type Word = { w: string; who: Who; turn: number; at: number };

/** Caption words that fall inside the cuts, timed in beat seconds (agent turns have no word timing, so it's spread evenly). */
export function captionWords(call: Call, segs: Seg[]): Word[] {
  const out: Word[] = [];
  let acc = 0;
  for (const seg of segs) {
    call.turns.forEach((turn, ti) => {
      const words = turn.text.split(/\s+/).filter(Boolean);
      words.forEach((w, i) => {
        const t = turn.t + (turn.dur * (i + 0.5)) / words.length;
        if (t >= seg.from - 0.1 && t <= seg.to + 0.1) out.push({ w, who: turn.who, turn: ti, at: acc + (t - seg.from) });
      });
    });
    acc += seg.to - seg.from;
  }
  return out.sort((a, b) => a.at - b.at);
}

/** Peak bars across the joined cuts for one speaker, `n` buckets. Values 0–1. */
export function bars(call: Call, segs: Seg[], who: Who, n: number): number[] {
  const { rate } = call.peaks;
  const src = call.peaks[who];
  const total = segs.reduce((s, g) => s + g.to - g.from, 0);
  return Array.from({ length: n }, (_, i) => {
    const t0 = (i / n) * total;
    const t1 = ((i + 1) / n) * total;
    let peak = 0;
    for (let t = t0; t < t1; t += 1 / rate) {
      const { rec } = toRecording(segs, t);
      peak = Math.max(peak, src[Math.floor(rec * rate)] ?? 0);
    }
    return peak / 255;
  });
}
