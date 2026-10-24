import { Geist_Mono } from 'next/font/google';

const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'] });

export const AGENT = '#8E9BFF';
export const FAULT = '#FF6A55';
export const WARM = '#F2A93B';

const r1 = (n: number) => Math.round(n * 10) / 10;

// Closed Catmull-Rom curve through points, as cubic Béziers.
function smoothClosed(pts: [number, number][]) {
  const n = pts.length;
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])} `;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [pts[(i - 1 + n) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])} `;
  }
  return d + 'Z';
}

// Irregular nested rings around a point, like elevation contours.
export function contours(cx: number, cy: number, levels: number, r0: number, step: number, seed: number) {
  return Array.from({ length: levels }, (_, k) => {
    const R = r0 + k * step;
    const pts: [number, number][] = [];
    for (let a = 0; a < 360; a += 12) {
      const t = (a * Math.PI) / 180;
      const wobble =
        1 +
        0.16 * Math.sin(2 * t + seed + k * 0.15) +
        0.09 * Math.sin(3 * t + seed * 1.7 - k * 0.2) +
        0.05 * Math.sin(5 * t + seed * 2.3);
      pts.push([cx + R * wobble * Math.cos(t) * 1.35, cy + R * wobble * Math.sin(t)]);
    }
    return smoothClosed(pts);
  });
}

// Faint wavy terrain lines across the whole map.
export function terrain(width: number, height: number, count: number) {
  return Array.from({ length: count }, (_, k) => {
    const y0 = (height / (count + 1)) * (k + 1);
    let d = '';
    for (let x = 0; x <= width; x += 20) {
      const y = y0 + 10 * Math.sin(x / 90 + k * 0.9) + 6 * Math.sin(x / 37 + k * 2.1);
      d += `${x === 0 ? 'M' : 'L'}${x} ${r1(y)} `;
    }
    return d;
  });
}

// Speech bars that swell from silence.
export function waveform(width: number, mid: number, maxH: number, quietUntil = 0.25) {
  const n = Math.floor(width / 5);
  let quiet = '';
  let loud = '';
  for (let i = 0; i < n; i++) {
    const x = r1(i * 5 + 1);
    const p = i / n;
    if (p < quietUntil) {
      quiet += `M${x} ${mid - 1} V${mid + 1} `;
    } else {
      const env = Math.sin(((p - quietUntil) / (1 - quietUntil)) * Math.PI);
      const h = 2 + env * maxH * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7)));
      loud += `M${x} ${r1(mid - h)} V${r1(mid + h)} `;
    }
  }
  return { quiet, loud };
}

const HOME = { x: 330, y: 430 };
const fault = contours(312, 422, 8, 16, 16, 0.6);
const faultFar = contours(150, 640, 4, 14, 13, 2.2);
const lines = terrain(800, 780, 20);

type Supplier = { x: number; y: number; name: string; note: string; tone: 'agent' | 'warm' | 'muted' | 'fault' };
const suppliers: Supplier[] = [
  { x: 560, y: 160, name: 'Whirlpool warranty', note: 'not covered', tone: 'muted' },
  { x: 652, y: 340, name: 'Valley Appliance', note: '$18', tone: 'agent' },
  { x: 604, y: 590, name: 'PartsDirect', note: '$9 + ship', tone: 'warm' },
  { x: 118, y: 230, name: 'Supplier 3', note: 'voicemail', tone: 'fault' },
];
const toneColor = { agent: AGENT, warm: WARM, muted: '#8E8E93', fault: FAULT };

const reasoning = [
  { dot: AGENT, text: 'Had Dorothy read the model sticker aloud, then read it back. Likely a blown thermal fuse, WP3392519.', meta: 'Diagnosis · 2:04 PM' },
  { dot: AGENT, text: 'Called the Whirlpool warranty line. Out of warranty, no free part.', meta: 'Action · 2:09 PM' },
  { dot: FAULT, text: 'Supplier 3 went to voicemail. Skipped it, not redialed.', meta: 'Guardrail · 2:11 PM' },
  { dot: AGENT, text: 'PartsDirect is $13.05 landed for the identical part. Under the $40 cap.', meta: 'Planner · 2:12 PM' },
];

const plan = [
  { step: 'Diagnose by voice', status: 'Done' },
  { step: 'Check the warranty first', status: 'Done' },
  { step: 'Compare three suppliers', status: 'Done' },
  { step: 'Get a spoken yes to order', status: 'Active' },
  { step: 'Delivery call, install together', status: 'Waiting' },
];

const panel = 'rounded-[10px] bg-[#131314]';
const small = 'text-[12px] text-[#8E8E93]';

export function FixieConsole() {
  const wave = waveform(220, 18, 13);
  return (
    <div className="overflow-hidden rounded-[14px] border border-[#1F1F22] bg-[#0E0E0F] shadow-[0_40px_120px_-40px_rgba(142,155,255,0.25)]">
      {/* Top strip */}
      <div className="flex items-center justify-between gap-3 border-b border-[#1F1F22] px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-[13px] font-medium">Fixie</span>
          <span className={`${small} truncate`}>Dorothy · Dryer, no heat</span>
        </div>
        <div className="flex shrink-0 items-center gap-3 sm:gap-4">
          <span className="inline-flex items-center gap-1.5 text-[12px]">
            <span className="h-1.5 w-1.5 rounded-full motion-safe:animate-pulse" style={{ background: AGENT }} />
            Waiting on her yes
          </span>
          <span className={`${mono.className} hidden text-[12px] text-[#8E8E93] sm:inline`}>day 1 · 14:12</span>
        </div>
      </div>

      <div className="grid gap-2 p-2 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Map */}
        <div className={`${panel} relative overflow-hidden`}>
          <div className="absolute left-4 top-3.5 z-10 flex flex-col">
            <span className={small}>Job 0142</span>
            <span className="text-[12px]">Whirlpool electric dryer · runs, won&rsquo;t heat</span>
          </div>
          <svg viewBox="0 0 800 780" className="block h-auto w-full" aria-hidden>
            {lines.map((d, i) => (
              <path key={i} d={d} fill="none" stroke="#EDEDED" strokeOpacity="0.06" strokeWidth="1" />
            ))}
            <path d="M0 530 C 180 500, 300 560, 470 522 S 700 500, 800 520" fill="none" stroke="#3A3A3E" strokeWidth="2" />
            <text x="760" y="510" textAnchor="end" fontSize="11" fill="#5A5A60">Hwy 52</text>

            {fault.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={FAULT} strokeWidth="1" strokeOpacity={0.9 - i * 0.1} />
            ))}
            {faultFar.map((d, i) => (
              <path key={i} d={d} fill="none" stroke={FAULT} strokeWidth="1" strokeOpacity={0.35 - i * 0.08} />
            ))}

            {/* Calls out to suppliers */}
            {suppliers.map((s) => (
              <line
                key={s.name}
                x1={HOME.x}
                y1={HOME.y}
                x2={s.x}
                y2={s.y}
                stroke={s.tone === 'fault' ? FAULT : AGENT}
                strokeOpacity={s.tone === 'fault' ? 0.5 : 0.55}
                strokeDasharray={s.tone === 'fault' ? '2 5' : undefined}
                strokeWidth="1"
              />
            ))}

            {/* Delivery route */}
            <path
              d={`M${suppliers[2].x} ${suppliers[2].y} Q 470 720 ${HOME.x + 6} ${HOME.y + 8}`}
              fill="none"
              stroke={WARM}
              strokeWidth="1.4"
              strokeDasharray="1 6"
              strokeLinecap="round"
              className="motion-safe:animate-[fixie-route_1.6s_linear_infinite]"
            />
            <text x="470" y="706" fontSize="11" fill={WARM} className={mono.className}>arrives tue</text>

            {suppliers.map((s) => (
              <g key={s.name}>
                <circle cx={s.x} cy={s.y} r="9" fill="none" stroke={toneColor[s.tone]} strokeOpacity="0.5" />
                <circle cx={s.x} cy={s.y} r="3.5" fill={toneColor[s.tone]} />
                <text x={s.x + 16} y={s.y - 2} fontSize="12" fill="#EDEDED">{s.name}</text>
                <text x={s.x + 16} y={s.y + 13} fontSize="11" fill={toneColor[s.tone]} className={mono.className}>
                  {s.note}
                </text>
              </g>
            ))}

            <rect x={HOME.x - 5} y={HOME.y - 5} width="10" height="10" fill="none" stroke="#EDEDED" strokeWidth="1.4" />
            <text x={HOME.x + 14} y={HOME.y + 22} fontSize="12" fill="#EDEDED">Dorothy · home</text>
            <text x="22" y="760" fontSize="11" fill="#5A5A60" className={mono.className}>
              ○ fault  — call  ··· delivery
            </text>
          </svg>
        </div>

        {/* Side column */}
        <div className="flex flex-col gap-2">
          <div className={`${panel} flex flex-col gap-3 p-4`}>
            <div className="flex justify-between">
              <span className={small}>Fixie → Dorothy</span>
              <span className={small}>4 s ago</span>
            </div>
            <p className="m-0 text-[17px] font-light leading-[1.35] tracking-[-0.01em]">
              Found your fuse for $13, against a $200 tech visit. It arrives Tuesday. Say yes to order.
            </p>
            <svg viewBox="0 0 220 36" className="h-9 w-full" preserveAspectRatio="none" aria-hidden>
              <path d={wave.quiet} stroke="#3A3A3E" strokeWidth="1.4" />
              <path d={wave.loud} stroke={AGENT} strokeWidth="1.4" />
            </svg>
          </div>

          <div className={`${panel} p-4`}>
            <div className="mb-1 flex justify-between">
              <span className={small}>Reasoning</span>
              <span className={small}>Last 8 min</span>
            </div>
            <ul className="m-0 list-none p-0">
              {reasoning.map((r) => (
                <li key={r.meta} className="flex gap-2.5 border-b border-[#1F1F22] py-2.5 last:border-0 last:pb-0">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.dot }} />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-[12.5px] leading-[1.4]">{r.text}</span>
                    <span className="text-[11px] text-[#6E6E73]">{r.meta}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className={`${panel} p-4`}>
            <div className="mb-1 flex justify-between">
              <span className={small}>Plan</span>
              <span className={small}>3 of 5 done</span>
            </div>
            <ol className="m-0 list-none p-0">
              {plan.map((p, i) => (
                <li key={p.step} className="flex items-baseline gap-3 py-1.5 text-[12.5px]">
                  <span className={`${mono.className} text-[11px] text-[#6E6E73]`}>{i + 1}</span>
                  <span className="flex-1">{p.step}</span>
                  <span
                    className="text-[11px]"
                    style={{ color: p.status === 'Active' ? AGENT : p.status === 'Done' ? '#EDEDED' : '#6E6E73' }}
                  >
                    {p.status}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
