import type { CSSProperties } from 'react';
import { Geist_Mono } from 'next/font/google';

const mono = Geist_Mono({ subsets: ['latin'], weight: ['400', '500'] });

export const AGENT = '#8E9BFF';
export const FAULT = '#FF6A55';
export const WARM = '#F2A93B';

const r1 = (n: number) => Math.round(n * 10) / 10;

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

type Line = { from: 'dorothy' | 'fixie'; at: string; text: string };
type Work = { text: string; detail?: string; tone?: 'agent' | 'warm' | 'muted' | 'fault' };
type Moment = { time: string; callStart?: string; phone: Line[]; callEnd?: string; idle?: string; work: Work[] };

const toneColor = { agent: AGENT, warm: WARM, muted: '#6E6E73', fault: FAULT };
const speaker = { dorothy: { name: 'Dorothy', color: '#EDEDED' }, fixie: { name: 'Fixie', color: AGENT } };

const story: Moment[] = [
  {
    time: '2:00 PM',
    callStart: 'Dorothy calls Fixie',
    phone: [
      { from: 'dorothy', at: '0:03', text: 'My dryer runs, but it won’t heat.' },
      { from: 'fixie', at: '0:09', text: 'Can you read me the model number on the sticker inside the door?' },
      { from: 'dorothy', at: '0:24', text: 'W, E, D, four, eight, one, five, E, W.' },
    ],
    work: [{ text: 'Matches the model to a blown thermal fuse', detail: 'Part WP3392519' }],
  },
  {
    time: '2:05 PM',
    phone: [{ from: 'fixie', at: '4:51', text: 'I’ll find you that part and call you right back.' }],
    callEnd: 'Hung up at 4:58',
    idle: 'Dorothy gets on with her day.',
    work: [
      { text: 'Calls the Whirlpool warranty line', detail: 'Not covered', tone: 'muted' },
      { text: 'Calls Valley Appliance', detail: '$18', tone: 'agent' },
      { text: 'Calls Supplier 3', detail: 'Voicemail, skipped', tone: 'fault' },
      { text: 'Checks PartsDirect online', detail: '$13.05 shipped, cheapest', tone: 'warm' },
    ],
  },
  {
    time: '2:12 PM',
    callStart: 'Fixie calls Dorothy back',
    phone: [
      { from: 'fixie', at: '0:02', text: 'Found your fuse for $13. A repair visit would run about $200. Should I order it?' },
      { from: 'dorothy', at: '0:11', text: 'Yes, go ahead.' },
    ],
    callEnd: 'Hung up at 0:19',
    work: [{ text: 'Orders from PartsDirect', detail: 'Only after hearing her yes', tone: 'warm' }],
  },
  {
    time: 'Tuesday',
    callStart: 'Fixie calls Dorothy',
    phone: [{ from: 'fixie', at: '0:03', text: 'Your part arrived. First, unplug the dryer. I’ll walk you through the rest.' }],
    work: [{ text: 'Talks her through the install, one step at a time' }],
  },
];

// Live-caption effect: ScrollEffects sets --p (0–100) as each moment scrolls
// through the viewport, and every word gets its own [--a, --b] slot in it, so
// the call transcribes itself as you scroll.
const TX_START = 8;
const TX_END = 42;
const at = (a: number, b = a + 4) => ({ '--a': a.toFixed(1), '--b': b.toFixed(1) }) as CSSProperties;

function transcribe(m: Moment) {
  const lines = m.phone.map((l) => l.text.split(' '));
  const step = (TX_END - TX_START) / lines.flat().length;
  let n = 0;
  return lines.map((words) => words.map((w) => ({ w, a: TX_START + step * n++, b: TX_START + step * n + Math.max(step * 3, 2) })));
}

function Voice({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 14 10" className="h-2.5 w-3.5 shrink-0" aria-hidden>
      {[3, 7, 10, 6, 4].map((h, i) => (
        <rect key={i} x={i * 3} y={(10 - h) / 2} width="1.6" height={h} rx="0.8" fill={color} />
      ))}
    </svg>
  );
}

function CallMarker({ text, end }: { text: string; end?: boolean }) {
  return (
    <span className={`${mono.className} inline-flex items-center gap-2 text-[11px] text-[#8E8E93]`}>
      <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke={end ? '#6E6E73' : AGENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 3h3l2 5-2.5 1.5a11 11 0 0 0 7 7L16 14l5 2v3a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z" />
      </svg>
      {text}
    </span>
  );
}

export function FixieConsole() {
  return (
    <div className="overflow-clip rounded-[14px] border border-[#1F1F22] bg-[#0E0E0F] shadow-[0_40px_120px_-40px_rgba(142,155,255,0.25)]">
      <div className="border-b border-[#1F1F22] px-5 py-4 sm:px-7">
        <span className="text-[15px]">Dorothy&rsquo;s dryer, start to finish</span>
      </div>

      <div className="hidden grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] gap-8 px-7 pt-5 md:grid">
        <span />
        <span className="text-[12px] text-[#8E8E93]">Phone calls, transcribed</span>
        <span className="text-[12px] text-[#8E8E93]">What Fixie does</span>
      </div>

      <ol className="m-0 list-none px-5 pb-3 sm:px-7">
        {story.map((m) => {
          const captions = transcribe(m);
          return (
            <li
              key={m.time}
              className="tx grid grid-cols-1 gap-4 border-b border-[#1F1F22] py-6 last:border-0 md:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] md:gap-8"
            >
              <span className={`${mono.className} tx-in pt-0.5 text-[12px] text-[#8E8E93]`} style={at(0, 6)}>{m.time}</span>

              <div className="flex flex-col gap-3.5">
                {m.callStart && (
                  <span className="tx-in" style={at(2, TX_START)}>
                    <CallMarker text={m.callStart} />
                  </span>
                )}
                <div className="flex flex-col gap-3.5 border-l pl-4" style={{ borderColor: '#2A2A2E' }}>
                  {m.phone.map((line, i) => {
                    const who = speaker[line.from];
                    const words = captions[i];
                    return (
                      <div key={i} className="flex flex-col gap-1">
                        <span className="tx-in inline-flex items-center gap-2 text-[11px]" style={at(words[0].a - 2, words[0].a + 1)}>
                          <Voice color={who.color} />
                          <span style={{ color: who.color }}>{who.name}</span>
                          <span className={`${mono.className} text-[#6E6E73]`}>{line.at}</span>
                        </span>
                        <p className="m-0 text-[15px] leading-[1.45] text-[#D6D6D9]">
                          {words.map(({ w, a, b }, j) => (
                            <span key={j} className="tx-word" style={at(a, b)}>
                              {j === 0 && '\u201C'}
                              {w}
                              {j === words.length - 1 ? '\u201D' : ' '}
                            </span>
                          ))}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {m.callEnd && (
                  <span className="tx-in" style={at(TX_END, TX_END + 4)}>
                    <CallMarker text={m.callEnd} end />
                  </span>
                )}
                {m.idle && (
                  <span className="tx-in text-[13px] italic text-[#6E6E73]" style={at(TX_END + 3, TX_END + 8)}>
                    {m.idle}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-2.5 md:pt-6">
                <span className="tx-in text-[11px] text-[#6E6E73] md:hidden" style={at(TX_END, TX_END + 3)}>
                  What Fixie does
                </span>
                {m.work.map((w, i) => (
                  <div key={w.text} className="tx-slide flex items-baseline gap-2.5 text-[14px]" style={at(TX_END + 2 + i * 5, TX_END + 10 + i * 5)}>
                    <span className="h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: toneColor[w.tone ?? 'agent'] }} />
                    <span className="flex flex-1 flex-col gap-0.5">
                      <span>{w.text}</span>
                      {w.detail && (
                        <span className={`${mono.className} text-[12px]`} style={{ color: w.tone ? toneColor[w.tone] : '#8E8E93' }}>
                          {w.detail}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
