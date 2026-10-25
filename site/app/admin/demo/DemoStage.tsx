'use client';

import { useEffect, useRef, useState } from 'react';

type Reel = 'stage' | 'montage';
type Phase = 'cued' | 'playing' | 'paused' | 'done';

const LABEL: Record<Reel, string> = { stage: 'Stage montage', montage: 'Full submission video' };

// Cued = black screen with a faint hint, so the projector shows nothing until the presenter hits M.
// M plays the stage montage, V the full video. Space pauses, R or Esc re-cues.
export function DemoStage() {
  const video = useRef<HTMLVideoElement>(null);
  const [reel, setReel] = useState<Reel>('stage');
  const [phase, setPhase] = useState<Phase>('cued');

  const play = async (which: Reel) => {
    const v = video.current;
    if (!v) return;
    if (reel !== which) {
      setReel(which);
      v.src = `/admin/demo/video/${which}`;
      v.load();
    }
    v.currentTime = 0;
    document.documentElement.requestFullscreen?.().catch(() => {});
    await v.play();
    setPhase('playing');
  };

  const cue = () => {
    const v = video.current;
    if (!v) return;
    v.pause();
    v.currentTime = 0;
    setPhase('cued');
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const v = video.current;
      const k = e.key.toLowerCase();
      if (k === 'm') play('stage');
      else if (k === 'v') play('montage');
      else if (k === 'r' || k === 'escape') cue();
      else if (k === ' ' && v && phase !== 'cued') {
        e.preventDefault();
        if (v.paused) v.play().then(() => setPhase('playing'));
        else {
          v.pause();
          setPhase('paused');
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const showing = phase === 'playing' || phase === 'paused';
  return (
    <main className="fixed inset-0 select-none bg-black text-[#EDEDED]" style={{ cursor: showing ? 'none' : 'default' }}>
      <video
        ref={video}
        src="/admin/demo/video/stage"
        preload="auto"
        playsInline
        onEnded={() => setPhase('done')}
        className="absolute inset-0 h-full w-full object-contain transition-opacity duration-700"
        style={{ opacity: showing ? 1 : 0 }}
      />
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-6 transition-opacity duration-500"
        style={{ opacity: showing ? 0 : 1, pointerEvents: showing ? 'none' : 'auto' }}
      >
        <button
          onClick={() => play('stage')}
          className="group inline-flex items-center gap-4 rounded-full border border-[#1F1F22] bg-[#0B0B0C] px-7 py-4 text-[17px] text-[#8E8E93] transition-colors hover:border-[#2A2A2E] hover:text-[#EDEDED]"
        >
          <span className="grid h-9 w-9 place-items-center rounded-full bg-[#EDEDED] text-[#0B0B0C]">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4" fill="currentColor" aria-hidden>
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
          </span>
          Play montage
          <kbd className="rounded-md border border-[#2A2A2E] px-2 py-0.5 font-mono text-[13px]">M</kbd>
        </button>
        <span className="font-mono text-[12px] text-[#3A3A3E]">
          {phase === 'done' ? `${LABEL[reel]} finished · ` : ''}M montage · V full video · Space pause · R re-cue
        </span>
      </div>
    </main>
  );
}
