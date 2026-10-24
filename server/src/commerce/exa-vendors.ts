// Local vendor discovery: find the real parts counters near the caller with Exa (~0.5s per search, all queries in
// parallel), then cast them onto the roster's supplier slots. A found vendor lends its NAME (and address/site for the
// board) only. The phone number always stays the roster slot's, so discovery can never make us dial a real business.
// If Exa is slow, down, or keyless, the cached result (data/vendors-cache.json) is used; if that is empty, the roster
// names stand. Never throws.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config.ts';
import type { RosterEntry } from '../types.ts';

export interface FoundVendor {
  name: string;
  url: string;
  domain: string;
  address: string | null;
  /** The business's real phone, shown on the board for credibility. Never dialed. */
  listedPhone: string | null;
  snippet: string;
  score: number;
}

export interface Discovery {
  vendors: FoundVendor[];
  freshness: 'live' | 'cached';
  ms: number;
  queries: string[];
  error?: string;
}

interface ExaResult {
  title?: string | null;
  url: string;
  highlights?: string[];
  text?: string;
}

const CACHE_FILE = join(DATA_DIR, 'vendors-cache.json');
const EXA_URL = 'https://api.exa.ai/search';
/** Directories, marketplaces and national web stores: the online lane already covers the stores; these aren't counters you call. */
const SKIP = /(^|\.)(exa\.ai|yelp\.|yellowpages\.|google\.|facebook\.|instagram\.|mapquest\.|angi\.|homeadvisor\.|thumbtack\.|bbb\.org|nextdoor\.|reddit\.|tiktok\.|youtube\.|linkedin\.|amazon\.|ebay\.|walmart\.|homedepot\.|lowes\.|repairclinic\.|partselect\.|appliancepartspros\.|searspartsdirect\.|whirlpoolparts\.|amanaparts\.|frigidaireapplianceparts\.|partsdr\.|fix\.com|mission-valley\.com|manta\.|chamberofcommerce\.|birdeye\.|superpages\.|local\.yahoo|wikipedia\.)/i;
const PHONE = /\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/;
const ADDRESS = /\b\d{2,6}\s+[A-Z0-9][\w.' ]{2,40}?\b(?:Ave|Avenue|St|Street|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Ln|Lane|Pkwy|Parkway|Ct|Hwy|Highway|Pl|Place)\.?(?:[,\s]+(?:Suite|Ste|#|Unit)\s*[\w-]+)?[,\s]+[A-Z][\w ]{2,30},?\s+CA\s+9\d{4}\b/;

export function city(): string {
  return process.env.FIXIE_CITY || 'San Diego, CA';
}

export function queriesFor(appliance: string | undefined, where = city()): string[] {
  const brand = (appliance ?? '').split(/\s+/)[0] || 'appliance';
  const kind = /dryer|washer|fridge|refrigerator|dishwasher|oven|range/i.exec(appliance ?? '')?.[0]?.toLowerCase() ?? 'appliance';
  return [
    `appliance parts store in ${where}`,
    `${brand} ${kind} parts dealer ${where}`,
    `${kind} repair parts counter near ${where}`,
    `wholesale appliance parts supply ${where}`,
  ];
}

/** "San Diego Coast Parts | Coast Appliance Parts" -> "Coast Appliance Parts"; "Appliance Parts Sales | San Diego, CA" -> "Appliance Parts Sales". */
export function nameFrom(title: string, domain: string, text = ''): string {
  const pieces = title.split(/\s+[|–—-]\s+|:\s+/).map((s) => s.trim()).filter(Boolean);
  const geo = /^(san diego|ca|california|home|parts|appliance parts|contact( us)?|about( us)?)(,? ca)?$/i;
  const named = pieces.filter((p) => !geo.test(p) && p.length <= 48);
  // Prefer the piece that looks like a business name (shares a word with the domain), else the shortest sensible one.
  const root = domain.split('.')[0].toLowerCase();
  const squash = (x: string) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const generic = /^(appliances?|parts?|repair|service|sales|supply|store|center|dryer|washer)$/;
  const distinctive = named.filter((p) => p.toLowerCase().split(/\W+/).some((w) => w.length > 3 && !generic.test(w) && root.includes(w))).pop();
  const hit = named.find((p) => squash(p) === root) ?? distinctive ?? fromText(text, root);
  const pick = hit ?? named.sort((a, b) => a.length - b.length)[0] ?? domain;
  return pick.replace(/\s*\b(in|near)\s+San Diego.*$/i, '').replace(/^(san diego\s+)/i, '').slice(0, 48).trim();
}

/** A capitalized phrase in the page text that spells the domain, e.g. "Browne's Appliance" for brownesappliance.com. */
function fromText(text: string, root: string): string | undefined {
  for (const m of text.matchAll(/\b[A-Z][\w'&]*(?:\s+(?:&\s+)?[A-Z][\w'&]*){0,3}/g)) {
    const words = m[0].split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      for (let n = words.length; n > i; n--) {
        const phrase = words.slice(i, n).join(' ');
        if (phrase.toLowerCase().replace(/[^a-z0-9]/g, '') === root) return phrase;
      }
    }
  }
  return undefined;
}

const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

/** Merge and rank raw Exa hits from all queries. Pure, so tests feed it fixtures. */
export function rank(hitsPerQuery: ExaResult[][], where = city(), count = 4): FoundVendor[] {
  const town = where.split(',')[0].toLowerCase();
  const byDomain = new Map<string, FoundVendor>();
  hitsPerQuery.forEach((hits) => hits.forEach((r, pos) => {
    const domain = domainOf(r.url);
    if (!domain || SKIP.test(domain)) return;
    const text = [...(r.highlights ?? []), r.text ?? ''].join(' ').replace(/\s+/g, ' ');
    const blob = `${r.title ?? ''} ${text}`;
    const address = ADDRESS.exec(text)?.[0] ?? null;
    const m = PHONE.exec(text);
    const listedPhone = m ? `(${m[1]}) ${m[2]}-${m[3]}` : null;
    let score = 4 - Math.min(pos, 4) * 0.5; // earlier in a result list is better
    if (/\bparts?\b/i.test(blob)) score += 2;
    if (blob.toLowerCase().includes(town)) score += 2;
    // A street address counts only if it is local (San Diego County zips are 919xx-921xx); a Bay Area one is a miss.
    if (address) score += /\b9(19|20|21)\d\d\b/.test(address) || address.toLowerCase().includes(town) ? 2 : -4;
    if (listedPhone) score += 1;
    if (!/appliance|parts?\b|dryer|washer|laundry/i.test(`${r.title ?? ''} ${domain}`)) score -= 3; // a vacuum shop, an HVAC firm
    if (/\brepair (service|company)|we repair|service call\b/i.test(blob) && !/parts (counter|store|sales|department)/i.test(blob)) score -= 1;
    const prev = byDomain.get(domain);
    if (prev) {
      prev.score += 1.5; // found by more than one query
      prev.address ??= address;
      prev.listedPhone ??= listedPhone;
      return;
    }
    byDomain.set(domain, { name: nameFrom(r.title ?? domain, domain, text), url: r.url, domain, address, listedPhone, snippet: text.slice(0, 220), score });
  }));
  return [...byDomain.values()].sort((a, b) => b.score - a.score).slice(0, count);
}

async function exaSearch(query: string, key: string, signal: AbortSignal): Promise<ExaResult[]> {
  const res = await fetch(EXA_URL, {
    method: 'POST',
    headers: { 'x-api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ query, type: 'fast', numResults: 8, userLocation: 'US', contents: { highlights: { maxCharacters: 400, query: 'address phone parts' } } }),
    signal,
  });
  if (!res.ok) throw new Error(`exa ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return ((await res.json()) as { results?: ExaResult[] }).results ?? [];
}

export function cachedVendors(): FoundVendor[] {
  try {
    return (JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as { vendors: FoundVendor[] }).vendors ?? [];
  } catch {
    return [];
  }
}

/** Live Exa discovery, all queries in parallel under one deadline; cached on any failure or a thin result. */
export async function discoverVendors(appliance?: string, opts: { count?: number; timeoutMs?: number; where?: string } = {}): Promise<Discovery> {
  const t0 = Date.now();
  const count = opts.count ?? 4;
  const where = opts.where ?? city();
  const queries = queriesFor(appliance, where);
  const fallback = (error: string): Discovery => ({ vendors: cachedVendors().slice(0, count), freshness: 'cached', ms: Date.now() - t0, queries, error });
  const key = process.env.EXA_API_KEY;
  if (!key || process.env.EXA_VENDORS === 'off') return fallback('exa disabled');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 2500);
  try {
    const settled = await Promise.allSettled(queries.map((q) => exaSearch(q, key, ctl.signal)));
    const ok = settled.flatMap((s) => (s.status === 'fulfilled' ? [s.value] : []));
    const vendors = rank(ok, where, count);
    if (vendors.length < count) {
      const err = settled.find((s): s is PromiseRejectedResult => s.status === 'rejected')?.reason?.message;
      return fallback(err ?? `exa found only ${vendors.length} local vendors`);
    }
    return { vendors, freshness: 'live', ms: Date.now() - t0, queries };
  } catch (err) {
    return fallback((err as Error).message);
  } finally {
    clearTimeout(timer);
  }
}

/** Put found vendors' names on the roster's supplier slots, in order. Id, phone, mode and simPersona stay the slot's. */
export function cast(slots: RosterEntry[], found: FoundVendor[]): RosterEntry[] {
  return slots.map((s, i) => (found[i] ? { ...s, name: found[i].name } : s));
}

// ---- per-job memo: one discovery per job, shared by every supplier call of that job ----
const perJob = new Map<string, Promise<Discovery>>();

export function vendorsForJob(jobId: string, appliance?: string): Promise<Discovery> {
  let p = perJob.get(jobId);
  if (!p) {
    p = discoverVendors(appliance);
    perJob.set(jobId, p);
  }
  return p;
}

const settledNames = new Map<string, Map<string, FoundVendor>>(); // jobId -> slot id -> vendor

export function recordCast(jobId: string, slots: RosterEntry[], found: FoundVendor[]): void {
  settledNames.set(jobId, new Map(slots.flatMap((s, i) => (found[i] ? [[s.id, found[i]] as const] : []))));
}

/** The discovered vendor playing this roster slot for this job, if any (sync; for names and the board). */
export function castFor(jobId: string | undefined, slotId: string | undefined): FoundVendor | undefined {
  return jobId && slotId ? settledNames.get(jobId)?.get(slotId) : undefined;
}

export function resetVendors(): void {
  perJob.clear();
  settledNames.clear();
}
