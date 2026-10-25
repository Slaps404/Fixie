// web_search for the voice agent: one fast Exa query, top results as short highlights, so the agent can check a fact
// instead of guessing. Never throws; with no key (or DRY_RUN) it says search is unavailable.
const EXA_URL = 'https://api.exa.ai/search';

interface ExaHit {
  title?: string | null;
  url: string;
  highlights?: string[];
}

export async function webSearch(query: string, timeoutMs = 4500): Promise<string> {
  const q = query.trim().slice(0, 200);
  if (!q) return 'Say what to search for.';
  const key = process.env.EXA_API_KEY;
  if (!key || process.env.DRY_RUN === '1') return "Search is unavailable right now. Tell them you're not sure and offer to find out and text them.";
  try {
    const res = await fetch(EXA_URL, {
      method: 'POST',
      headers: { 'x-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ query: q, type: 'fast', numResults: 4, userLocation: 'US', contents: { highlights: { maxCharacters: 350, query: q } } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`exa ${res.status}`);
    const hits = (((await res.json()) as { results?: ExaHit[] }).results ?? []).filter((h) => h.highlights?.length).slice(0, 3);
    if (!hits.length) return "No useful results. Tell them you're not sure rather than guessing.";
    const lines = hits.map((h, i) => `${i + 1}. ${new URL(h.url).hostname.replace(/^www\./, '')}: ${h.highlights!.join(' ').replace(/\s+/g, ' ').slice(0, 350)}`);
    return `Search results for "${q}":\n${lines.join('\n')}\nSay only what these support, in plain words; if they don't answer it, say you're not sure. You can text them a link with send_text.`;
  } catch (err) {
    return `Search failed (${(err as Error).message}). Tell them you're not sure rather than guessing.`;
  }
}
