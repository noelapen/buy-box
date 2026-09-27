/* liveSearch.js — Real-time product search across Indian e-commerce platforms
 *
 * Aggregates results from: SerpAPI (Google Shopping), Amazon PA-API, Flipkart Affiliate.
 * Each source is optional — falls back to offline dataset when none are configured.
 */

import { normalizeGoogleProduct, normalizeAmazonProduct, normalizeFlipkartProduct } from './normalizeProduct.js';
import { getFallbackProducts } from './fallbackData.js';

const env = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env : {};

const SERPAPI_KEY = env.VITE_SERPAPI_KEY || '';
const AMAZON_ACCESS = env.VITE_AMAZON_ACCESS_KEY || '';
const AMAZON_SECRET = env.VITE_AMAZON_SECRET_KEY || '';
const AMAZON_TAG = env.VITE_AMAZON_PARTNER_TAG || '';
const FK_ID = env.VITE_FLIPKART_AFFILIATE_ID || '';
const FK_TOKEN = env.VITE_FLIPKART_TOKEN || '';

// ── Google Shopping via SerpAPI ──────────────────────────────

async function searchGoogle(query, limit = 20) {
  if (!SERPAPI_KEY) return [];
  try {
    const params = new URLSearchParams({
      engine: 'google_shopping', q: query, location: 'India',
      gl: 'in', hl: 'en', num: String(limit), api_key: SERPAPI_KEY,
    });
    const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.shopping_results || []).slice(0, limit).map(normalizeGoogleProduct);
  } catch { return []; }
}

// ── Amazon India PA-API 5.0 ─────────────────────────────────

async function searchAmazon(query, limit = 10) {
  if (!AMAZON_ACCESS || !AMAZON_SECRET || !AMAZON_TAG) return [];
  try {
    const payload = {
      Keywords: query, SearchIndex: 'All', ItemCount: Math.min(limit, 10),
      PartnerTag: AMAZON_TAG, PartnerType: 'Associates', Marketplace: 'www.amazon.in',
      Resources: [
        'ItemInfo.Title', 'ItemInfo.ByLineInfo', 'ItemInfo.Classifications',
        'ItemInfo.Features', 'Offers.Listings.Price',
        'Offers.Listings.Availability.Message', 'Images.Primary.Large',
      ],
    };
    const headers = await signAmazonRequest(payload);
    const res = await fetch('https://webservices.amazon.in/paapi5/searchitems', {
      method: 'POST', headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.SearchResult?.Items || []).map(normalizeAmazonProduct);
  } catch { return []; }
}

// ── Flipkart Affiliate API ──────────────────────────────────

async function searchFlipkart(query, limit = 15) {
  if (!FK_ID || !FK_TOKEN) return [];
  try {
    const url = `https://affiliate-api.flipkart.net/affiliate/1.0/search.json?query=${encodeURIComponent(query)}&resultCount=${limit}`;
    const res = await fetch(url, {
      headers: { 'Fk-Affiliate-Id': FK_ID, 'Fk-Affiliate-Token': FK_TOKEN },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.productInfoList || []).slice(0, limit).map(item => {
      const attrs = item.productBaseInfo?.productAttributes || item;
      return normalizeFlipkartProduct(attrs);
    });
  } catch { return []; }
}

// ── Aggregator ──────────────────────────────────────────────

/** Fetch from all configured sources in parallel, deduplicate, fallback to offline. */
export async function fetchAllProducts(query, limit = 15) {
  const sourceNames = [];
  const fetchers = [];

  if (SERPAPI_KEY) { sourceNames.push('Google Shopping'); fetchers.push(searchGoogle(query, limit)); }
  if (AMAZON_ACCESS) { sourceNames.push('Amazon'); fetchers.push(searchAmazon(query, limit)); }
  if (FK_ID) { sourceNames.push('Flipkart'); fetchers.push(searchFlipkart(query, limit)); }

  const results = await Promise.allSettled(fetchers);
  const products = [];
  const sources = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled' && r.value.length) {
      products.push(...r.value);
      sources.push(sourceNames[i]);
    }
  });

  if (!products.length) {
    return { products: getFallbackProducts(), sources: ['Offline dataset'], live: false };
  }

  return { products: deduplicate(products), sources, live: true };
}

/** Which sources are configured */
export function getSourceStatus() {
  return [
    { name: 'Google Shopping', available: Boolean(SERPAPI_KEY) },
    { name: 'Amazon India', available: Boolean(AMAZON_ACCESS && AMAZON_SECRET && AMAZON_TAG) },
    { name: 'Flipkart', available: Boolean(FK_ID && FK_TOKEN) },
    { name: 'Offline Dataset', available: true },
  ];
}

// ── Deduplication ───────────────────────────────────────────

function deduplicate(products) {
  const seen = [];
  return products.filter(p => {
    const norm = (p.product_name || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    if (!norm) return true;
    const dup = seen.some(s => jaccard(norm, s) > 0.85);
    if (!dup) seen.push(norm);
    return !dup;
  });
}

function jaccard(a, b) {
  const sa = new Set(a.split(/\s+/)), sb = new Set(b.split(/\s+/));
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return union ? inter / union : 0;
}

// ── AWS Sig V4 for Amazon PA-API ────────────────────────────

const PAAPI_HOST = 'webservices.amazon.in';

async function signAmazonRequest(payload) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const body = JSON.stringify(payload);
  const region = 'eu-west-1', service = 'ProductAdvertisingAPI';
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';
  const signedHeaders = 'content-encoding;content-type;host;x-amz-date;x-amz-target';

  const canonical = [
    'POST', '/paapi5/searchitems', '',
    `content-encoding:amz-1.0\ncontent-type:application/json; charset=utf-8\nhost:${PAAPI_HOST}\nx-amz-date:${amzDate}\nx-amz-target:${target}\n`,
    signedHeaders, await sha256(body),
  ].join('\n');

  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256(canonical)].join('\n');
  const kDate = await hmac(enc('AWS4' + AMAZON_SECRET), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  const sig = hex(await hmac(kSigning, toSign));

  return {
    'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'amz-1.0',
    'Host': PAAPI_HOST, 'X-Amz-Date': amzDate, 'X-Amz-Target': target,
    'Authorization': `AWS4-HMAC-SHA256 Credential=${AMAZON_ACCESS}/${scope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
  };
}

const enc = s => new TextEncoder().encode(s);
async function hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc(msg)));
}
async function sha256(msg) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc(msg)))); }
function hex(buf) { return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join(''); }
