/**
 * fallbackData.js — Offline Fallback Dataset
 *
 * Provides access to the local product dataset (converted from the original
 * products.csv) for offline operation or as a supplement to API results.
 *
 * Used when:
 *   (a) API calls fail or are unavailable
 *   (b) Extension is used offline
 *   (c) Supplementing API results with additional platforms
 */

import productsData from '../data/products.json';
import { normalizeOfflineProduct } from './normalizeProduct.js';

/**
 * Get all products from the offline fallback dataset, normalized.
 *
 * @returns {Object[]} Array of normalized product objects
 */
export function getFallbackProducts() {
  return productsData.map(normalizeOfflineProduct);
}

/**
 * Get the total number of products in the fallback dataset.
 *
 * @returns {number}
 */
export function getFallbackProductCount() {
  return productsData.length;
}
