/**
 * retrieval.js — IR Retrieval Pipeline Orchestrator
 *
 * Coordinates the full Information Retrieval pipeline:
 *   Query → Preprocessing → Candidate Fetch → TF-IDF → Cosine Similarity → Top-K
 *
 * Retrieval is SEPARATE from ranking. This module produces results with
 * relevance_score (cosine similarity). Ranking/badges are applied downstream.
 */

import { searchEbay } from '../services/ebayApi.js';
import { getFallbackProducts } from '../services/fallbackData.js';
import { buildDocument, preprocessDocument, preprocessQuery } from './preprocessing.js';
import { cosineSimilarity } from './similarity.js';
import { TfidfVectorizer } from './tfidf.js';
import { rankProducts } from '../services/ranking.js';
import {
  extractProductIdentity,
  hasProductTitleOverlap,
  isSameBrand,
  isSameCategory,
} from './productIdentity.js';

export const MIN_SIMILARITY = 0.01;

/**
 * Retrieve and rank products for a given query using the full IR pipeline.
 *
 * Steps:
 *   1. Preprocess query (lowercase, tokenize, stop-word removal, stemming)
 *   2. Fetch candidate products from eBay API + local fallback
 *   3. Build document strings for each candidate
 *   4. Fit TF-IDF vectorizer on the document corpus
 *   5. Compute cosine similarity between query vector and all document vectors
 *   6. Sort by relevance and return Top-K results with ranking badges
 *
 * @param {string} query - Raw user search query
 * @param {number} [topK=10] - Maximum number of results to return
 * @returns {Promise<Object>} Retrieval result with query, results, pipeline, source
 */
export async function retrieveProducts(query, topK = 10) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return emptyResult(cleanQuery);

  // Step 1: Preprocess query
  const processedQuery = preprocessQuery(cleanQuery);

  // Step 2: Fetch candidates from API + fallback
  const [apiProducts, fallbackProducts] = await Promise.all([
    searchEbay(cleanQuery, topK),
    Promise.resolve(getFallbackProducts()),
  ]);

  const products = [...apiProducts, ...fallbackProducts];

  const identity = extractProductIdentity(cleanQuery, products);
  const filteredProducts = products.filter(product => (
    isSameBrand(product, identity)
    && isSameCategory(product, identity)
    && hasProductTitleOverlap(product, identity)
  ));

  if (!filteredProducts.length) {
    return noMatchResult(cleanQuery, processedQuery, identity, apiProducts.length);
  }

  // Step 3 & 4: Build documents and fit TF-IDF on eligible products only
  const vectorizer = new TfidfVectorizer();
  const documents = filteredProducts.map(product => preprocessDocument(buildDocument(product)));
  const documentVectors = vectorizer.fitTransform(documents);

  // Step 5: Transform query and compute cosine similarity
  const queryVector = vectorizer.transform([processedQuery])[0];
  const results = filteredProducts.map((product, index) => ({
    ...product,
    relevance_score: cosineSimilarity(queryVector, documentVectors[index]),
  })).filter(product => product.relevance_score >= MIN_SIMILARITY);

  // Step 6: Sort by relevance, take Top-K, then rank with badges
  const topResults = results
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, topK);

  if (!topResults.length) {
    return noMatchResult(cleanQuery, processedQuery, identity, apiProducts.length);
  }

  const matchedPlatforms = new Set(topResults.map(product => product.platform));
  const availablePlatforms = [...new Set(products
    .map(product => product.platform)
    .filter(platform => platform && platform !== 'N/A'))];
  const missingPlatforms = availablePlatforms.filter(platform => !matchedPlatforms.has(platform));

  return {
    query: cleanQuery,
    processedQuery,
    identity,
    missingPlatforms,
    results: rankProducts(topResults),
    pipeline: [
      'Original query',
      'Lowercase, tokenize, stopword removal, stemming',
      'TF-IDF vectors',
      'Vector Space Model',
      'Cosine similarity',
      'Top-K',
    ],
    source: apiProducts.length ? 'eBay API + offline fallback' : 'Offline fallback dataset',
  };
}

function noMatchResult(query, processedQuery, identity, hasApiResults) {
  return {
    query,
    processedQuery,
    identity,
    missingPlatforms: [],
    results: [],
    noMatchMessage: identity.brand
      ? `Exact same-brand ${identity.category || 'product'} not found`
      : 'A recognized brand is required to compare the same product across platforms',
    pipeline: [
      'Original query',
      'Extract brand and product type',
      'Reject different brands and unrelated categories',
      'TF-IDF vectors',
      'Cosine similarity threshold',
      'No eligible matches',
    ],
    source: hasApiResults ? 'Marketplace API' : 'Offline fallback dataset',
  };
}

function emptyResult(query) {
  return {
    query,
    processedQuery: '',
    identity: { brand: '', category: '' },
    results: [],
    noMatchMessage: 'Enter a product with its brand to compare exact matches',
    pipeline: [],
    source: 'N/A',
  };
}
