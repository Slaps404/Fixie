import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { theme } from "../theme";
import {
  bars,
  beatFrames,
  type Beat,
  CALLS,
  captionWords,
  FPS,
  offsets,
  type Overlay,
  type Seg,
  toRecording,
  type Who,
} from "./beats";

const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
const GREEN = "#25D366";
const color = (who: Who) => (who === "agent" ? theme.accent : theme.text);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const recordedAt = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/Los_Angeles" });

/** Fades each cut in and out over a few frames so joins don't click. */
const edgeFade = (len: number, volume: number) => (f: number) =>
  volume * Math.min(1, f / 3, (len - f) / 3);

function Chrome({ children }: { children: React.ReactNode }) {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: theme.bg, color: theme.text, fontFamily: theme.font }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 70% 55% at 50% 45%, rgba(142,155,255,0.10), transparent 70%)",
        }}
      />
      <div style={{ position: "absolute", top: 56, left: 120, right: 120, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 30, fontWeight: 600 }}>
          <svg viewBox="0 0 22 22" width={34} height={34} fill="none">
            <circle cx="5" cy="17" r="2.2" fill={theme.text} />
            <path d="M5 10.5A6.5 6.5 0 0 1 11.5 17" stroke={theme.accent} strokeWidth="1.6" strokeLinecap="round" />
            <path d="M5 4a13 13 0 0 1 13 13" stroke={theme.warm} strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          Fixie
        </div>
        <div style={{ fontFamily: mono, fontSize: 22, color: theme.muted, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 6, background: theme.fault, opacity: 0.5 + 0.5 * Math.abs(Math.sin(frame / 12)) }} />
          Real calls, recorded tonight
        </div>
      </div>
      {children}
    </AbsoluteFill>
  );
}

function Wave({ values, progress, height, cuts = [] }: { values: { agent: number[]; other: number[] }; progress: number; height: number; cuts?: number[] }) {
  const n = values.agent.length;
  const half = height / 2;
  return (
    <svg viewBox={`0 0 ${n * 10} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: "block" }}>
      <line x1={0} x2={n * 10} y1={half} y2={half} stroke={theme.line} strokeWidth={1} />
      {values.agent.map((a, i) => {
        const played = i / n <= progress;
        const o = values.other[i];
        const op = played ? 1 : 0.18;
        return (
          <g key={i} opacity={op}>
            <rect x={i * 10 + 2} y={half - 2 - a * (half - 6)} width={6} height={2 + a * (half - 6)} rx={3} fill={theme.accent} />
            <rect x={i * 10 + 2} y={half + 1} width={6} height={1 + o * (half - 6)} rx={3} fill={theme.text} />
          </g>
        );
      })}
      {cuts.map((c) => (
        <line key={c} x1={c * n * 10} x2={c * n * 10} y1={8} y2={height - 8} stroke={theme.muted} strokeDasharray="6 8" strokeWidth={2} />
      ))}
      <line x1={progress * n * 10} x2={progress * n * 10} y1={0} y2={height} stroke={theme.warm} strokeWidth={3} />
    </svg>
  );
}

function pop(frame: number, at: number, fps: number) {
  return spring({ frame: frame - at * fps, fps, config: { damping: 16, stiffness: 140 } });
}

function OverlayCard({ o }: { o: Overlay }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = pop(frame, o.at, fps);
  if (frame < o.at * fps) return null;
  const base: React.CSSProperties = {
    position: "absolute",
    right: 120,
    top: 190,
    width: 760,
    borderRadius: 22,
    padding: "30px 36px",
    background: "rgba(19,19,20,0.92)",
    transform: `translateY(${(1 - p) * 40}px) scale(${0.94 + 0.06 * p})`,
    opacity: p,
    boxShadow: "0 30px 80px -20px rgba(0,0,0,0.8)",
  };
  if (o.kind === "whatsapp") {
    return (
      <div style={{ ...base, padding: 0, overflow: "hidden", border: `1px solid ${theme.line}` }}>
        <div style={{ background: "#075E54", padding: "16px 26px", fontSize: 24, display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ width: 38, height: 38, borderRadius: 19, background: GREEN, display: "grid", placeItems: "center", fontSize: 22 }}>☀️</span>
          Fixie · WhatsApp
        </div>
        <div style={{ padding: 26, background: "#0B141A" }}>
          <div style={{ background: "#005C4B", borderRadius: 14, padding: "18px 22px", fontSize: 32, lineHeight: 1.3 }}>{o.text}</div>
        </div>
      </div>
    );
  }
  if (o.kind === "diagnosis") {
    const w = interpolate(frame - o.at * fps, [0, 24], [0, 82], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
    return (
      <div style={{ ...base, border: `1px solid ${theme.line}` }}>
        <div style={{ fontFamily: mono, fontSize: 22, color: theme.muted }}>Most likely</div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 38, marginTop: 10 }}>
          <span>Blown thermal fuse</span>
          <span style={{ fontFamily: mono, color: theme.accent }}>{Math.round(w)}%</span>
        </div>
        <div style={{ height: 12, borderRadius: 6, background: theme.line, marginTop: 16 }}>
          <div style={{ width: `${w}%`, height: "100%", borderRadius: 6, background: theme.accent }} />
        </div>
        <div style={{ fontFamily: mono, fontSize: 22, color: theme.muted, marginTop: 16 }}>Part WP3392519 · about $13</div>
      </div>
    );
  }
  const tone = o.kind === "card" ? theme.accent : theme.fault;
  const icon = o.kind === "guard" ? "⛔" : o.kind === "stop" ? "✋" : "💳";
  return (
    <div style={{ ...base, border: `2px solid ${tone}` }}>
      <div style={{ display: "flex", gap: 18, alignItems: "center", fontSize: 42, fontWeight: 600, color: tone }}>
        <span>{icon}</span>
        {o.title}
      </div>
      <div style={{ fontSize: 30, color: theme.body, marginTop: 12 }}>{o.detail}</div>
    </div>
  );
}

function Captions({ words, t, who }: { words: ReturnType<typeof captionWords>; t: number; who: { agent: string; other: string } }) {
  const spoken = words.filter((w) => w.at <= t);
  if (!spoken.length) return null;
  const turn = spoken[spoken.length - 1].turn;
  const line = words.filter((w) => w.turn === turn);
  const speaker = line[0].who;
  return (
    <div style={{ position: "absolute", left: 120, right: 120, bottom: 96 }}>
      <div style={{ fontSize: 26, color: color(speaker), fontWeight: 600, marginBottom: 12 }}>{who[speaker]}</div>
      <div style={{ fontSize: 60, fontWeight: 400, lineHeight: 1.18, letterSpacing: "-0.02em", maxWidth: 1600 }}>
        “
        {line.map((w, i) => (
          <span key={i} style={{ opacity: w.at <= t ? 1 : 0.12 }}>
            {w.w}{" "}
          </span>
        ))}
        ”
      </div>
    </div>
  );
}

function ClipBeat({ beat }: { beat: Extract<Beat, { kind: "clip" }> }) {
  const frame = useCurrentFrame();
  const call = CALLS[beat.call];
  const t = frame / FPS;
  const total = beat.segs.reduce((s, g) => s + g.to - g.from, 0);
  const { rec } = toRecording(beat.segs, Math.min(t, total));
  const words = captionWords(call, beat.segs);
  const n = Math.max(60, Math.round(total * 12));
  const values = { agent: bars(call, beat.segs, "agent", n), other: bars(call, beat.segs, "other", n) };
  const cuts: number[] = [];
  beat.segs.slice(0, -1).reduce((acc, g) => (cuts.push((acc + g.to - g.from) / total), acc + g.to - g.from), 0);
  let start = 0;
  const enter = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: "clamp" });
  return (
    <Chrome>
      {beat.segs.map((g: Seg) => {
        const from = Math.round(start * FPS);
        const len = Math.round((g.to - g.from) * FPS);
        start += g.to - g.from;
        return (
          <Sequence key={g.from} from={from} durationInFrames={len}>
            <Audio src={staticFile(`calls/${beat.call}.mp3`)} trimBefore={Math.round(g.from * FPS)} trimAfter={Math.round(g.to * FPS)} volume={edgeFade(len, 1)} />
          </Sequence>
        );
      })}
      <div style={{ position: "absolute", left: 120, top: 190, opacity: enter, transform: `translateY(${(1 - enter) * 16}px)` }}>
        <div style={{ fontSize: 56, fontWeight: 400, letterSpacing: "-0.02em" }}>{beat.label}</div>
        <div style={{ fontFamily: mono, fontSize: 24, color: theme.muted, marginTop: 14 }}>
          {call.phone ?? ""} · recorded {recordedAt(call.startedAt)} · call time {clock(rec)}
          {beat.segs.length > 1 ? ` · ${beat.segs.length} cuts` : ""}
        </div>
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, top: 400, opacity: enter }}>
        <Wave values={values} progress={Math.min(1, t / total)} height={260} cuts={cuts} />
      </div>
      <Captions words={words} t={t} who={beat.who} />
      {beat.overlay && <OverlayCard o={beat.overlay} />}
    </Chrome>
  );
}

function ParallelBeat({ beat }: { beat: Extract<Beat, { kind: "parallel" }> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / FPS;
  const len = beat.to - beat.from;
  const offs = offsets(beat.calls.map((c) => c.id));
  return (
    <Chrome>
      <div style={{ position: "absolute", left: 120, top: 170, fontSize: 56, letterSpacing: "-0.02em" }}>
        She hung up. Fixie makes three calls at once.
      </div>
      <div style={{ position: "absolute", left: 120, right: 120, top: 290, display: "flex", flexDirection: "column", gap: 34 }}>
        {beat.calls.map((c, i) => {
          const call = CALLS[c.id];
          const segs = [{ from: beat.from - offs[i], to: beat.to - offs[i] }];
          const words = captionWords(call, segs);
          const spoken = words.filter((w) => w.at <= t);
          const turn = spoken.length ? spoken[spoken.length - 1].turn : -1;
          const line = words.filter((w) => w.turn === turn && w.at <= t).slice(-9);
          const p = pop(frame, i * 0.25, fps);
          const n = Math.round(len * 14);
          const lenF = Math.round(len * FPS);
          return (
            <div key={c.id} style={{ opacity: p, transform: `translateX(${(1 - p) * -40}px)`, display: "grid", gridTemplateColumns: "430px 1fr", gap: 30, alignItems: "center" }}>
              <Audio src={staticFile(`calls/${c.id}.mp3`)} trimBefore={Math.round(segs[0].from * FPS)} trimAfter={Math.round(segs[0].to * FPS)} volume={edgeFade(lenF, 0.75)} />
              <div>
                <div style={{ fontSize: 34 }}>{c.name}</div>
                <div style={{ fontFamily: mono, fontSize: 22, color: theme.muted, marginTop: 6 }}>
                  {call.phone} · call time {clock(segs[0].from + Math.min(t, len))}
                </div>
                <div style={{ fontSize: 24, color: theme.body, marginTop: 10, height: 64, overflow: "hidden", lineHeight: 1.3 }}>
                  {line.length > 0 && <span style={{ color: color(line[0].who) }}>{line.map((w) => w.w).join(" ")}</span>}
                </div>
              </div>
              <Wave values={{ agent: bars(call, segs, "agent", n), other: bars(call, segs, "other", n) }} progress={t / len} height={170} />
            </div>
          );
        })}
      </div>
    </Chrome>
  );
}

function TitleBeat({ beat }: { beat: Extract<Beat, { kind: "title" }> }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = pop(frame, 0, fps);
  const b = pop(frame, 0.5, fps);
  return (
    <Chrome>
      <div style={{ position: "absolute", left: 160, right: 160, top: 360 }}>
        <div style={{ fontFamily: mono, fontSize: 28, color: theme.accent, opacity: a }}>{beat.kicker}</div>
        <div style={{ fontSize: 120, fontWeight: 400, letterSpacing: "-0.035em", lineHeight: 1.04, marginTop: 24, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
          {beat.title}
        </div>
        {beat.sub && <div style={{ fontSize: 120, fontWeight: 400, letterSpacing: "-0.035em", color: theme.muted, opacity: b, transform: `translateY(${(1 - b) * 30}px)` }}>{beat.sub}</div>}
      </div>
    </Chrome>
  );
}

function EndBeat() {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = pop(frame, 0, fps);
  const b = pop(frame, 0.4, fps);
  return (
    <Chrome>
      <div style={{ position: "absolute", left: 160, top: 250, width: 900, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        <div style={{ fontFamily: mono, fontSize: 26, color: theme.muted }}>Families sign up in 30 seconds: phone, code, card.</div>
        <div style={{ fontSize: 104, fontWeight: 400, letterSpacing: "-0.035em", lineHeight: 1.05, marginTop: 28 }}>
          Call <span style={{ color: theme.warm }}>(619) 771-1086</span>
        </div>
        <div style={{ fontSize: 64, color: theme.muted, letterSpacing: "-0.02em", marginTop: 20, lineHeight: 1.1 }}>One number for anything that breaks.</div>
      </div>
      <Img
        src={staticFile("signup.png")}
        style={{ position: "absolute", right: 120, top: 220, width: 620, borderRadius: 18, border: `1px solid ${theme.line}`, opacity: b, transform: `translateY(${(1 - b) * 40}px)`, boxShadow: "0 40px 120px -40px rgba(142,155,255,0.35)" }}
      />
    </Chrome>
  );
}

export const Montage: React.FC<{ beats: Beat[] }> = ({ beats }) => {
  let at = 0;
  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      {beats.map((beat, i) => {
        const from = at;
        const dur = beatFrames(beat);
        at += dur;
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={beat.kind === "clip" ? beat.label : beat.kind}>
            {beat.kind === "clip" && <ClipBeat beat={beat} />}
            {beat.kind === "parallel" && <ParallelBeat beat={beat} />}
            {beat.kind === "title" && <TitleBeat beat={beat} />}
            {beat.kind === "end" && <EndBeat />}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
