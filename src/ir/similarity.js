/**
 * similarity.js — Cosine Similarity for Information Retrieval
 *
 * JavaScript port of sklearn.metrics.pairwise.cosine_similarity.
 * Computes the cosine of the angle between two TF-IDF vectors.
 *
 * Cosine Similarity Formula:
 *   Similarity(Q, D) = (Q · D) / (||Q|| × ||D||)
 *
 * Where Q is the query vector and D is the document vector.
 * Result ranges from 0 (no similarity) to 1 (identical direction).
 *
 * Since our TF-IDF vectors are already L2-normalized, cosine similarity
 * simplifies to just the dot product: Similarity = Q · D
 */


/**
 * Compute cosine similarity between two sparse TF-IDF vectors.
 *
 * Both vectors are expected to be L2-normalized (as produced by our
 * TfidfVectorizer), so cosine similarity = dot product.
 *
 * @param {Object} vecA - Sparse vector { termIndex: weight }
 * @param {Object} vecB - Sparse vector { termIndex: weight }
 * @returns {number} Similarity score in [0, 1]
 */
export function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;

  // Iterate over the smaller vector for efficiency
  const [smaller, larger] = Object.keys(vecA).length <= Object.keys(vecB).length
    ? [vecA, vecB]
    : [vecB, vecA];

  for (const key in smaller) {
    if (key in larger) {
      dotProduct += smaller[key] * larger[key];
    }
  }

  // Vectors are already L2-normalized, so dot product = cosine similarity
  // Clamp to [0, 1] to handle floating point imprecision
  return Math.max(0, Math.min(1, dotProduct));
}


/**
 * Compute cosine similarity between a query vector and all document vectors.
 *
 * @param {Object} queryVec - Sparse TF-IDF vector for the query
 * @param {Object[]} docVecs - Array of sparse TF-IDF vectors for documents
 * @returns {number[]} Array of similarity scores, one per document
 */
export function computeAllSimilarities(queryVec, docVecs) {
  return docVecs.map(docVec => cosineSimilarity(queryVec, docVec));
}
