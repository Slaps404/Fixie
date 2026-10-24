// Online quote lane: price the exact part at web stores while the phone calls run, so web and phone
// quotes are ranked together on landed total. Live lookup is Claude + the web_search server tool; an
// offer survives only if its URL's host appeared in the search results Claude actually got back.
// If the live lookup fails or times out, a cached, sourced table (data/online-prices.json) is used.
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../config.ts';
import { parts } from '../parts.ts';
import type { PartInfo, Quote } from '../types.ts';

export const STORES = ['Amazon', 'eBay', 'RepairClinic', 'PartSelect', 'AppliancePartsPros', 'Home Depot', 'Walmart', 'Sears PartsDirect'];
/** One lookup per group, in parallel: wider coverage in the same wall-clock time. */
const STORE_GROUPS: Array<{ stores: string[]; domains?: string[] }> = [
  { stores: ['Amazon'], domains: ['amazon.com'] },
  { stores: ['eBay'], domains: ['ebay.com'] },
  { stores: ['Walmart', 'Home Depot'] },
  { stores: ['RepairClinic', 'PartSelect', 'AppliancePartsPros', 'Sears PartsDirect'] },
];
/** Shipping we assume when neither the listing nor the store states it. Deliberately high, so a web quote never ranks on an undercounted total. */
export const SHIPPING_ESTIMATE_USD = 9.99;
const MODEL = process.env.ONLINE_QUOTES_MODEL || 'claude-sonnet-5-5';
const CACHE_FILE = join(DATA_DIR, 'online-prices.json');

export interface OnlineQuote {
  merchant: string;
  vendorId: string;
  price: number;
  shipping: number;
  shippingSource: 'listing' | 'store_policy' | 'estimated';
  landedTotal: number;
  inStock: boolean;
  url: string;
  eta: string | null;
  partNumberSaid: string;
  /** Genuine OEM part (vs. "compatible with" aftermarket). */
  genuine: boolean;
  /** Computed here (part-number match and genuine), never trusted from the model. */
  identicalPart: boolean;
  source: 'online';
  freshness: 'live' | 'cached';
  fetchedAt: string;
}

interface RawOffer {
  merchant: string;
  url: string;
  price: number;
  shipping: number | null;
  shippingSource?: 'listing' | 'store_policy' | 'unknown' | 'estimated';
  inStock: boolean;
  partNumberShown: string;
  genuine: boolean;
  eta: string | null;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const round2 = (n: number) => Math.round(n * 100) / 100;

function finish(raw: RawOffer[], part: PartInfo, freshness: 'live' | 'cached', fetchedAt: string): OnlineQuote[] {
  const out: OnlineQuote[] = [];
  for (const r of raw) {
    if (!(r.price > 0) || !/^https:\/\//.test(r.url)) continue;
    const known = typeof r.shipping === 'number' && r.shipping >= 0 && r.shippingSource !== 'unknown';
    const shipping = known ? (r.shipping as number) : SHIPPING_ESTIMATE_USD;
    const shippingSource = known ? (r.shippingSource === 'store_policy' ? 'store_policy' : 'listing') : 'estimated';
    const identical = parts.isIdentical(r.partNumberShown, part) && r.genuine;
    out.push({
      merchant: r.merchant, vendorId: `online:${slug(r.merchant)}`, price: round2(r.price), shipping: round2(shipping), shippingSource,
      landedTotal: round2(r.price + shipping), inStock: r.inStock, url: r.url, eta: r.eta, partNumberSaid: r.partNumberShown,
      genuine: r.genuine, identicalPart: identical, source: 'online', freshness, fetchedAt,
    });
  }
  return out.sort((a, b) => a.landedTotal - b.landedTotal);
}

const OFFERS_TOOL: Anthropic.Tool = {
  name: 'record_offers',
  description: 'Record every concrete listing you found. Call once, after searching.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      offers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            merchant: { type: 'string', description: `Store name, one of: ${STORES.join(', ')}` },
            url: { type: 'string', description: 'The listing URL exactly as it appeared in a search result' },
            price: { type: 'number', description: 'Item price in USD for one unit' },
            shipping: { type: ['number', 'null'], description: "Shipping in USD for this one-item order to a US address: 0 if free, else the listing's or the store's stated standard rate; null only if you could not find either" },
            shippingSource: { type: 'string', enum: ['listing', 'store_policy', 'unknown'] },
            inStock: { type: 'boolean' },
            partNumberShown: { type: 'string', description: 'The part number printed on the listing' },
            genuine: { type: 'boolean', description: 'True only for a genuine OEM part, false for "compatible"/"replacement for"/multi-packs' },
            eta: { type: ['string', 'null'], description: 'Delivery estimate if shown' },
          },
          required: ['merchant', 'url', 'price', 'shipping', 'shippingSource', 'inStock', 'partNumberShown', 'genuine', 'eta'],
        },
      },
    },
    required: ['offers'],
  },
};

/** Live lookup across all store groups in parallel. Throws only if every group failed; returns [] if nothing verifiable was found. */
export async function liveOnlineQuotes(part: PartInfo, timeoutMs = 50_000, client = new Anthropic()): Promise<OnlineQuote[]> {
  const settled = await Promise.allSettled(STORE_GROUPS.map((g) => lookupGroup(part, g, timeoutMs, client)));
  const ok = settled.filter((r): r is PromiseFulfilledResult<RawOffer[]> => r.status === 'fulfilled');
  if (!ok.length) throw new Error(settled.map((r) => (r as PromiseRejectedResult).reason?.message).join('; '));
  const byUrl = new Map<string, RawOffer>();
  for (const r of ok) for (const o of r.value) if (!byUrl.has(o.url)) byUrl.set(o.url, o);
  return finish([...byUrl.values()], part, 'live', new Date().toISOString());
}

async function lookupGroup(part: PartInfo, { stores, domains }: (typeof STORE_GROUPS)[number], timeoutMs: number, client: Anthropic): Promise<RawOffer[]> {
  const deadline = Date.now() + timeoutMs;
  const messages: Anthropic.MessageParam[] = [{
    role: 'user',
    content: `Find current US online listings for appliance part ${part.partNumber} (${part.name}; cross-references ${part.crossRefs.join(', ')}). Check these stores: ${stores.join(', ')}. Search the web; search snippets often show the price, and you can open a listing page with web_fetch to read its price, shipping and stock. If a listing doesn't show shipping, use that store's published standard shipping rate for a small order and mark it store_policy. Cover every one of those stores you can. Then call record_offers once with every concrete listing you saw: the listing URL exactly as it appeared in a search result, the one-unit price, shipping (0 if free, null if not shown), whether it is in stock, the part number on the listing, and whether it is the genuine OEM part. Do not guess prices or invent URLs; leave out anything you did not see.`,
  }];
  const seenHosts = new Set<string>();
  for (let hop = 0; hop < 4; hop++) {
    const left = deadline - Date.now();
    if (left < 2000) throw new Error('online quote lookup timed out');
    const res = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        tools: [
          { type: 'web_search_20250305', name: 'web_search', max_uses: 6, user_location: { type: 'approximate', country: 'US' }, ...(domains ? { allowed_domains: domains } : {}) },
          { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 8, max_content_tokens: 6000, ...(domains ? { allowed_domains: domains } : {}) },
          OFFERS_TOOL,
        ],
        messages,
      },
      { timeout: left, maxRetries: 0 },
    );
    if (res.stop_reason === 'refusal') throw new Error('online quote lookup declined');
    for (const b of res.content) {
      if (b.type === 'web_search_tool_result' && Array.isArray(b.content)) {
        for (const r of b.content) if (r.type === 'web_search_result') seenHosts.add(host(r.url));
      }
      if (b.type === 'web_fetch_tool_result' && b.content.type === 'web_fetch_result') seenHosts.add(host(b.content.url));
      if (process.env.DEBUG_ONLINE) {
        if (b.type === 'text') console.error('[online] text', b.text.slice(0, 300));
        if (b.type === 'server_tool_use') console.error('[online] call', b.name, JSON.stringify(b.input));
        if (b.type === 'web_fetch_tool_result') console.error('[online] fetch', JSON.stringify(b.content).slice(0, 160));
      }
    }
    const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'record_offers');
    if (call) {
      const all = (call.input as { offers?: RawOffer[] }).offers ?? [];
      const offers = all.filter((o) => seenHosts.has(host(o.url)));
      if (process.env.DEBUG_ONLINE) console.error('[online] hosts', [...seenHosts], 'offers', all);
      return offers;
    }
    messages.push({ role: 'assistant', content: res.content });
    if (res.stop_reason !== 'pause_turn') messages.push({ role: 'user', content: 'Now call record_offers with what you found.' });
  }
  throw new Error('online quote lookup never reported offers');
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

interface CacheFile {
  [partNumber: string]: { fetchedAt: string; note?: string; offers: RawOffer[] };
}

export function cachedOnlineQuotes(part: PartInfo): OnlineQuote[] {
  try {
    const cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8')) as CacheFile;
    const entry = cache[part.partNumber];
    return entry ? finish(entry.offers, part, 'cached', entry.fetchedAt) : [];
  } catch {
    return [];
  }
}

/** Live first; cached on any failure or an empty live result. Never throws. */
export async function getOnlineQuotes(part: PartInfo, opts: { timeoutMs?: number; live?: boolean } = {}): Promise<{ quotes: OnlineQuote[]; freshness: 'live' | 'cached'; error?: string }> {
  if (opts.live !== false && process.env.ANTHROPIC_API_KEY) {
    try {
      const quotes = await liveOnlineQuotes(part, opts.timeoutMs);
      if (quotes.length) return { quotes, freshness: 'live' };
      return { quotes: cachedOnlineQuotes(part), freshness: 'cached', error: 'live lookup found no verifiable listings' };
    } catch (err) {
      return { quotes: cachedOnlineQuotes(part), freshness: 'cached', error: (err as Error).message };
    }
  }
  return { quotes: cachedOnlineQuotes(part), freshness: 'cached', error: 'live lookup disabled' };
}

/** The engine's Quote shape, so online and phone quotes rank and pass guards.checkQuote together. */
export function toQuote(o: OnlineQuote): Quote & { url: string; freshness: 'live' | 'cached' } {
  return {
    vendorId: o.vendorId, supplier: o.merchant, price: o.price, shipping: o.shipping, landedTotal: o.landedTotal,
    inStock: o.inStock, eta: o.eta, partNumberSaid: o.partNumberSaid, identicalPart: o.identicalPart,
    callId: `online_${o.vendorId.slice(7)}_${Date.parse(o.fetchedAt) || 0}`,
    source: 'online',
    url: o.url, freshness: o.freshness,
  };
}
