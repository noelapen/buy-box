/* retrieval.js — IR Pipeline: Query → Preprocessing → Fetch → TF-IDF → Cosine Sim → Rank */

import { fetchAllProducts } from '../services/liveSearch.js';
import { getFallbackProducts } from '../services/fallbackData.js';
import { buildDocument, preprocessDocument, preprocessQuery } from './preprocessing.js';
import { cosineSimilarity } from './similarity.js';
import { TfidfVectorizer } from './tfidf.js';
import { rankProducts } from '../services/ranking.js';
import {
  extractProductIdentity, hasProductTitleOverlap,
  isSameBrand, isSameCategory,
} from './productIdentity.js';

export const MIN_SIMILARITY = 0.01;

/**
 * Full retrieval pipeline:
 *  1. Preprocess query
 *  2. Fetch candidates (live APIs → fallback dataset)
 *  3. Filter by brand/category identity
 *  4. TF-IDF vectorization + cosine similarity
 *  5. Top-K with ranking badges
 */
export async function retrieveProducts(query, topK = 10) {
  const cleanQuery = String(query || '').trim();
  if (!cleanQuery) return emptyResult(cleanQuery);

  // Step 1: Preprocess
  const processedQuery = preprocessQuery(cleanQuery);

  // Step 2: Fetch from all live sources (falls back to offline)
  const { products, sources, live } = await fetchAllProducts(cleanQuery, topK);

  // Step 3: Identity-based filtering
  const identity = extractProductIdentity(cleanQuery, products);
  const filtered = products.filter(p =>
    isSameBrand(p, identity) && isSameCategory(p, identity) && hasProductTitleOverlap(p, identity)
  );

  if (!filtered.length) return noMatchResult(cleanQuery, processedQuery, identity, sources);

  // Step 4: TF-IDF + Cosine Similarity
  const vectorizer = new TfidfVectorizer();
  const docs = filtered.map(p => preprocessDocument(buildDocument(p)));
  const docVectors = vectorizer.fitTransform(docs);
  const queryVector = vectorizer.transform([processedQuery])[0];

  const scored = filtered
    .map((p, i) => ({ ...p, relevance_score: cosineSimilarity(queryVector, docVectors[i]) }))
    .filter(p => p.relevance_score >= MIN_SIMILARITY);

  // Step 5: Top-K + rank
  const topResults = scored.sort((a, b) => b.relevance_score - a.relevance_score).slice(0, topK);
  if (!topResults.length) return noMatchResult(cleanQuery, processedQuery, identity, sources);

  const matchedPlatforms = new Set(topResults.map(p => p.platform));
  const allPlatforms = [...new Set(products.map(p => p.platform).filter(p => p && p !== 'N/A'))];
  const missingPlatforms = allPlatforms.filter(p => !matchedPlatforms.has(p));

  return {
    query: cleanQuery,
    processedQuery,
    identity,
    missingPlatforms,
    results: rankProducts(topResults),
    pipeline: ['Original query', 'Preprocess (lowercase, tokenize, stem)', 'Fetch candidates', 'TF-IDF vectors', 'Cosine similarity', 'Top-K ranking'],
    sources,
  };
}

export function resolveProductCandidates(liveProducts = [], fallbackProducts = []) {
  return (Array.isArray(liveProducts) && liveProducts.length > 0)
    ? [...liveProducts]
    : (Array.isArray(fallbackProducts) ? [...fallbackProducts] : []);
}

function noMatchResult(query, processedQuery, identity, sources) {
  return {
    query, processedQuery, identity, missingPlatforms: [], results: [],
    noMatchMessage: identity.brand
      ? `Exact same-brand ${identity.category || 'product'} not found`
      : 'A recognized brand is required to compare the same product across platforms',
    pipeline: ['Original query', 'Extract brand/category', 'Filter', 'No eligible matches'],
    sources: sources || [],
  };
}

function emptyResult(query) {
  return {
    query, processedQuery: '', identity: { brand: '', category: '' },
    results: [], noMatchMessage: 'Enter a product with its brand to compare exact matches',
    pipeline: [], sources: [],
  };
}
