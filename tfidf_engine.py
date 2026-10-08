"""
IR CONCEPT 2 — VECTOR SPACE MODEL (TF-IDF + COSINE SIMILARITY)
Represents queries and documents as weighted term vectors and
computes relevance via cosine similarity.

TF-IDF Formula:
  TF(t,d)    = count(t in d) / total_terms(d)
  IDF(t)     = log((N+1) / (df(t)+1)) + 1     (smooth IDF)
  TF-IDF     = TF * IDF

Cosine Similarity:
  sim(Q, D) = (Q · D) / (||Q|| * ||D||)

High TF-IDF means a term is frequent in THIS document but rare overall,
making it a strong discriminator. Cosine similarity measures directional
alignment between the query vector and each document vector.
"""

import math
from collections import Counter


def compute_tfidf_vectors(query_tokens, documents, include_vectors=False):
    """
    Build TF-IDF vectors for all documents and the query,
    then compute cosine similarity scores.

    Args:
        query_tokens: list of preprocessed query terms
        documents: list of lists, each inner list is preprocessed document terms

    Returns:
        list of cosine similarity scores, or scores and vectors when requested
    """
    # Count term frequencies per document
    doc_counters = [Counter(doc) for doc in documents]

    # Document frequency: how many documents contain each term
    doc_freq = Counter(
        token for doc in doc_counters for token in doc.keys()
    )
    total_docs = len(doc_counters)

    def vectorize(term_counts):
        """Convert raw term counts into a TF-IDF weighted vector."""
        length = sum(term_counts.values())
        if not length:
            return {}
        return {
            token: (count / length) * (math.log((total_docs + 1) / (doc_freq.get(token, 0) + 1)) + 1)
            for token, count in term_counts.items()
        }

    doc_vectors = [vectorize(dc) for dc in doc_counters]
    query_vector = vectorize(Counter(query_tokens))

    # Compute cosine similarity between query and each document
    query_norm = math.sqrt(sum(w * w for w in query_vector.values()))
    scores = []
    for vec in doc_vectors:
        doc_norm = math.sqrt(sum(w * w for w in vec.values()))
        dot = sum(w * vec.get(t, 0) for t, w in query_vector.items())
        denom = query_norm * doc_norm
        scores.append(dot / denom if denom else 0.0)

    if include_vectors:
        return scores, {"query_vector": query_vector, "document_vectors": doc_vectors}
    return scores
