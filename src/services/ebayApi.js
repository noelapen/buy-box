/**
 * ebayApi.js — eBay Browse API Client
 *
 * Fetches product candidates from the eBay Browse API via a serverless proxy.
 * The proxy handles OAuth2 token acquisition — no secrets in extension source.
 *
 * If the proxy is not configured or unreachable, returns an empty array
 * so the retrieval engine falls back to the offline dataset gracefully.
 */

import { normalizeEbayProduct } from './normalizeProduct.js';

// Proxy URL — set this to your deployed serverless proxy endpoint.
// Leave empty to skip eBay API and use offline fallback only.
const PROXY_BASE_URL = import.meta.env.VITE_EBAY_PROXY_URL || '';

/**
 * Search eBay for products matching the given query.
 *
 * @param {string} query - Search query string
 * @param {number} [limit=20] - Maximum number of results to fetch
 * @returns {Promise<Object[]>} Array of normalized product objects from eBay
 */
export async function searchEbay(query, limit = 20) {
  // If no proxy is configured, return empty (use fallback data)
  if (!PROXY_BASE_URL) {
    console.log('[eBay API] No proxy configured — using offline fallback');
    return [];
  }

  try {
    const url = `${PROXY_BASE_URL}/api/ebay/search?q=${encodeURIComponent(query)}&limit=${limit}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      console.warn(`[eBay API] Request failed with status ${response.status}`);
      return [];
    }

    const data = await response.json();
    const items = data.itemSummaries || data.items || [];

    // Normalize each eBay result into our standard schema
    return items.map(normalizeEbayProduct);
  } catch (error) {
    console.warn('[eBay API] Request error:', error.message);
    return [];
  }
}
