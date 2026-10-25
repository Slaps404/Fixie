// Copies the recorded calls the montage uses from demo-assets/recordings (filled by
// server/scripts/fetch-recordings.ts) into public/calls/*.mp3 and src/montage/calls.json.
// Both outputs are gitignored: they hold real voices and transcripts.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const SRC = new URL('../../demo-assets/recordings/', import.meta.url);
const ids = process.argv.slice(2);
mkdirSync(new URL('../public/calls/', import.meta.url), { recursive: true });
const out = {};
for (const id of ids) {
  const r = JSON.parse(readFileSync(new URL(`${id}.json`, SRC), 'utf8'));
  copyFileSync(new URL(`${id}.mp3`, SRC), new URL(`../public/calls/${id}.mp3`, import.meta.url));
  out[id] = {
    id,
    lane: r.lane,
    party: r.party,
    phone: r.phone,
    startedAt: r.startedAt,
    durationSec: r.durationSec,
    peaks: r.peaks,
    turns: r.messages.filter((m) => m.kind === 'say').map(({ who, t, dur, text }) => ({ who, t, dur, text })),
    events: r.events.filter((e) => ['guard', 'quote', 'diagnosis', 'order_confirmed', 'install_step'].includes(e.type)).map(({ t, type, data }) => ({ t, type, data })),
  };
}
writeFileSync(new URL('../src/montage/calls.json', import.meta.url), JSON.stringify(out));
console.log(`synced ${ids.length} calls`);
