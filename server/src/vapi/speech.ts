// Spoken forms for ids and money. TTS reads "W-P" as letters and pauses at "...", so the listener hears chunks, not a blur.

/** Split a run of n characters into ceil(n/4) near-even groups, larger groups last: 7 → 3+4, 6 → 3+3, 8 → 4+4, 10 → 3+3+4. */
function groupSizes(n: number): number[] {
  const count = Math.ceil(n / 4);
  const base = Math.floor(n / count);
  const extra = n % count;
  return Array.from({ length: count }, (_, i) => base + (i >= count - extra ? 1 : 0));
}

/** "WP3392519" → "W-P... 3-3-9... 2-5-1-9". Letters and digits never share a chunk. */
export function spellForSpeech(id: string): string {
  const runs = id.toUpperCase().replace(/[^A-Z0-9]/g, '').match(/[A-Z]+|[0-9]+/g) ?? [];
  const chunks: string[] = [];
  for (const run of runs) {
    let at = 0;
    for (const size of groupSizes(run.length)) {
      chunks.push(run.slice(at, at + size).split('').join('-'));
      at += size;
    }
  }
  return chunks.join('... ');
}

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function underThousand(n: number): string {
  const words: string[] = [];
  if (n >= 100) words.push(`${ONES[Math.floor(n / 100)]} hundred`);
  const rest = n % 100;
  if (rest >= 20) words.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ''));
  else if (rest > 0 || n === 0) words.push(ONES[rest]);
  return words.join(' ');
}

function numberWords(n: number): string {
  if (n < 1000) return underThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  return `${numberWords(thousands)} thousand${rest ? ` ${underThousand(rest)}` : ''}`;
}

/** 15 → "fifteen dollars", 9.1 → "nine dollars and ten cents", 0.5 → "fifty cents". */
export function moneyForSpeech(n: number): string {
  const cents = Math.round(Math.abs(n) * 100);
  const d = Math.floor(cents / 100);
  const c = cents % 100;
  const dollars = `${numberWords(d)} dollar${d === 1 ? '' : 's'}`;
  if (!c) return dollars;
  const centWords = `${numberWords(c)} cent${c === 1 ? '' : 's'}`;
  return d ? `${dollars} and ${centWords}` : centWords;
}
