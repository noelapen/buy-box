/**
 * tfidf.js — TF-IDF Vectorizer for Information Retrieval
 *
 * Pure JavaScript replacement of sklearn's TfidfVectorizer.
 * Implements the classic TF-IDF (Term Frequency–Inverse Document Frequency)
 * weighting scheme used in the Vector Space Model.
 *
 * TF-IDF Formula:
 *   TF(t, d)    = (Number of times term t appears in document d) / (Total terms in d)
 *   IDF(t)      = log(Total documents / Number of documents containing t) + 1
 *   TF-IDF(t,d) = TF(t, d) × IDF(t)
 *
 *   High TF-IDF → term is frequent in THIS document but rare across ALL documents
 *                → term is a strong identifier for this document
 *
 * The +1 in IDF is smooth IDF (prevents zero division and matches sklearn default).
 */

export class TfidfVectorizer {
  constructor() {
    /** @type {Map<string, number>} vocabulary: term → index */
    this.vocabulary = new Map();
    /** @type {number[]} idf weights for each term in vocabulary */
    this.idf = [];
    /** @type {number} total documents in fitted corpus */
    this.numDocs = 0;
    /** @type {boolean} whether the vectorizer has been fitted */
    this.fitted = false;
  }

  /**
   * Learn vocabulary and IDF weights from the document corpus.
   *
   * @param {string[]} documents - Array of preprocessed document strings
   */
  fit(documents) {
    this.numDocs = documents.length;
    const termDocFreq = new Map(); // term → number of docs containing it
    let termIndex = 0;

    // Build vocabulary and count document frequency for each term
    for (const doc of documents) {
      const terms = doc.split(/\s+/).filter(t => t.length > 0);
      const uniqueTerms = new Set(terms);

      for (const term of uniqueTerms) {
        // Add to vocabulary if new
        if (!this.vocabulary.has(term)) {
          this.vocabulary.set(term, termIndex++);
        }
        // Increment document frequency
        termDocFreq.set(term, (termDocFreq.get(term) || 0) + 1);
      }
    }

    // Compute IDF for each term in vocabulary
    // Using smooth IDF: log((N + 1) / (df + 1)) + 1  (matches sklearn's smooth_idf=True)
    this.idf = new Array(this.vocabulary.size);
    for (const [term, idx] of this.vocabulary) {
      const df = termDocFreq.get(term) || 0;
      this.idf[idx] = Math.log((this.numDocs + 1) / (df + 1)) + 1;
    }

    this.fitted = true;
  }

  /**
   * Transform documents into TF-IDF vectors using the fitted vocabulary.
   *
   * Each vector is represented as a plain object { termIndex: tfidfWeight }
   * for sparse storage efficiency.
   *
   * @param {string[]} documents - Array of preprocessed document strings
   * @returns {Object[]} Array of sparse TF-IDF vectors
   */
  transform(documents) {
    if (!this.fitted) {
      throw new Error('TfidfVectorizer must be fitted before transforming.');
    }

    return documents.map(doc => {
      const terms = doc.split(/\s+/).filter(t => t.length > 0);
      const totalTerms = terms.length;

      if (totalTerms === 0) return {};

      // Count term frequencies in this document
      const termCounts = new Map();
      for (const term of terms) {
        termCounts.set(term, (termCounts.get(term) || 0) + 1);
      }

      // Compute TF-IDF for each term
      const vector = {};
      for (const [term, count] of termCounts) {
        const idx = this.vocabulary.get(term);
        if (idx !== undefined) {
          // TF = count / total terms in document
          const tf = count / totalTerms;
          // TF-IDF = TF × IDF
          vector[idx] = tf * this.idf[idx];
        }
        // Terms not in vocabulary (from transform-only docs like queries) are ignored
      }

      // L2 normalize the vector (matches sklearn default)
      const magnitude = Math.sqrt(
        Object.values(vector).reduce((sum, v) => sum + v * v, 0)
      );
      if (magnitude > 0) {
        for (const key in vector) {
          vector[key] /= magnitude;
        }
      }

      return vector;
    });
  }

  /**
   * Convenience method: fit and transform in one step.
   *
   * @param {string[]} documents - Array of preprocessed document strings
   * @returns {Object[]} Array of sparse TF-IDF vectors
   */
  fitTransform(documents) {
    this.fit(documents);
    return this.transform(documents);
  }

  /**
   * Get the vocabulary size (number of unique terms).
   * @returns {number}
   */
  get vocabularySize() {
    return this.vocabulary.size;
  }
}
