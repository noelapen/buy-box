"""
IR CONCEPT 3 -- RELEVANCE FEEDBACK (Query Expansion)
Implements three classic relevance-feedback algorithms that modify the
original query vector to improve retrieval:

  1. Rocchio:      Q' = a*Q  +  b*(1/|Dr|)*Sum Dj  -  g*(1/|Dn|)*Sum Dk
  2. Ide Regular:  Q' = a*Q  +  b*Sum Dj            -  g*Sum Dk
  3. Ide Dec-Hi:   Q' = a*Q  +  b*Sum Dj            -  g*max_nrel(Dk)

where
  Q   = original query vector (raw term-frequency weights)
  Dr  = set of relevant documents
  Dn  = set of non-relevant documents
  a, b, g  = tuning constants (defaults: 1.0, 0.75, 0.25)

Term-selection methods applied to every modified vector:
  - Fixed cutoff   (tau = 0.1): keep terms with weight >= tau
  - Top-K          (k = 5):     keep the k highest-weighted terms
  - Relative cutoff(rho = 0.3): keep terms with weight >= rho * max_weight

Uses raw term-frequency vectors for feedback calculations as specified
in the experiment, while the ranking system continues to use TF-IDF +
cosine similarity.
"""

from collections import Counter


# -- Default Rocchio parameters ------------------------------------------------
ALPHA = 1.0
BETA  = 0.75
GAMMA = 0.25

# -- Term-selection thresholds -------------------------------------------------
TAU = 0.1       # fixed cutoff
K   = 5         # top-K
RHO = 0.3       # relative cutoff


# ---------------------------------------------------------------------------
# Raw term-frequency vector builder
# ---------------------------------------------------------------------------

def _raw_tf_vector(tokens):
    """Build a raw term-frequency vector (dict) from a token list."""
    counter = Counter(tokens)
    total = sum(counter.values())
    if total == 0:
        return {}
    return {term: count / total for term, count in counter.items()}


# ---------------------------------------------------------------------------
# Centroid helpers
# ---------------------------------------------------------------------------

def _centroid(vectors):
    """Return the mean (centroid) of a list of vectors."""
    if not vectors:
        return {}
    n = len(vectors)
    result = {}
    for vec in vectors:
        for term, weight in vec.items():
            result[term] = result.get(term, 0.0) + weight
    return {term: weight / n for term, weight in result.items()}


def _sum_vectors(vectors):
    """Return the element-wise sum of a list of vectors."""
    result = {}
    for vec in vectors:
        for term, weight in vec.items():
            result[term] = result.get(term, 0.0) + weight
    return result


def _scale(vector, scalar):
    """Multiply every weight in the vector by a scalar."""
    return {term: weight * scalar for term, weight in vector.items()}


def _add(vec_a, vec_b):
    """Element-wise addition of two vectors."""
    result = dict(vec_a)
    for term, weight in vec_b.items():
        result[term] = result.get(term, 0.0) + weight
    return result


def _subtract(vec_a, vec_b):
    """Element-wise subtraction: vec_a - vec_b."""
    result = dict(vec_a)
    for term, weight in vec_b.items():
        result[term] = result.get(term, 0.0) - weight
    return result


# ---------------------------------------------------------------------------
# The three relevance-feedback algorithms
# ---------------------------------------------------------------------------

def rocchio(query_vec, rel_vecs, nrel_vecs,
            alpha=ALPHA, beta=BETA, gamma=GAMMA):
    """
    Standard Rocchio formula:
      Q' = alpha*Q  +  beta*centroid(Dr)  -  gamma*centroid(Dn)
    """
    q_part    = _scale(query_vec, alpha)
    rel_part  = _scale(_centroid(rel_vecs), beta)    if rel_vecs  else {}
    nrel_part = _scale(_centroid(nrel_vecs), gamma)  if nrel_vecs else {}
    return _subtract(_add(q_part, rel_part), nrel_part)


def ide_regular(query_vec, rel_vecs, nrel_vecs,
                alpha=ALPHA, beta=BETA, gamma=GAMMA):
    """
    Ide Regular formula (no averaging -- uses raw sums):
      Q' = alpha*Q  +  beta*Sum(Dj)  -  gamma*Sum(Dk)
    """
    q_part    = _scale(query_vec, alpha)
    rel_part  = _scale(_sum_vectors(rel_vecs), beta)    if rel_vecs  else {}
    nrel_part = _scale(_sum_vectors(nrel_vecs), gamma)  if nrel_vecs else {}
    return _subtract(_add(q_part, rel_part), nrel_part)


def ide_dec_hi(query_vec, rel_vecs, nrel_vecs,
               alpha=ALPHA, beta=BETA, gamma=GAMMA):
    """
    Ide Dec-Hi formula -- uses only the HIGHEST-RANKED non-relevant doc:
      Q' = alpha*Q  +  beta*Sum(Dj)  -  gamma*D_nrel_max
    The 'highest-ranked' non-relevant document is the first element
    of nrel_vecs (they should arrive in rank order).
    """
    q_part    = _scale(query_vec, alpha)
    rel_part  = _scale(_sum_vectors(rel_vecs), beta) if rel_vecs else {}
    nrel_part = _scale(nrel_vecs[0], gamma)          if nrel_vecs else {}
    return _subtract(_add(q_part, rel_part), nrel_part)


# ---------------------------------------------------------------------------
# Term-selection methods
# ---------------------------------------------------------------------------

def _fixed_cutoff(modified_vec, tau=TAU):
    """Keep terms whose weight >= tau."""
    return {t: w for t, w in modified_vec.items() if w >= tau}


def _top_k(modified_vec, k=K):
    """Keep the k highest-weighted terms."""
    ranked = sorted(modified_vec.items(), key=lambda x: x[1], reverse=True)
    return dict(ranked[:k])


def _relative_cutoff(modified_vec, rho=RHO):
    """Keep terms whose weight >= rho * max(weight)."""
    if not modified_vec:
        return {}
    max_w = max(modified_vec.values())
    if max_w <= 0:
        return {}
    threshold = rho * max_w
    return {t: w for t, w in modified_vec.items() if w >= threshold}


def apply_term_selection(modified_vec):
    """Apply all three term-selection methods and return a dict of results."""
    # First, zero out any negative weights (standard practice)
    positive_vec = {t: max(w, 0.0) for t, w in modified_vec.items()}
    # Remove exact zeros
    positive_vec = {t: w for t, w in positive_vec.items() if w > 0}

    return {
        "fixed_cutoff":    _fixed_cutoff(positive_vec),
        "top_k":           _top_k(positive_vec),
        "relative_cutoff": _relative_cutoff(positive_vec),
    }


# ---------------------------------------------------------------------------
# Pseudo-relevance feedback -- label top docs as relevant
# ---------------------------------------------------------------------------

def pseudo_relevance_split(scores, top_rel=3, top_nrel=3):
    """
    Pseudo-relevance feedback: assume the top-ranked documents are
    relevant and the bottom-ranked documents are non-relevant.

    Args:
        scores: list of (index, cosine_score) tuples, sorted descending
        top_rel:  number of top docs to treat as relevant
        top_nrel: number of bottom docs to treat as non-relevant

    Returns:
        (relevant_indices, non_relevant_indices)
    """
    if not scores:
        return [], []
    sorted_scores = sorted(scores, key=lambda x: x[1], reverse=True)
    if sorted_scores[0][1] <= 0:
        return [], []
    rel_indices = [idx for idx, _ in sorted_scores[:top_rel]]
    nrel_indices = [idx for idx, _ in sorted_scores[-top_nrel:]]
    # Make sure there's no overlap (can happen with very few docs)
    nrel_indices = [i for i in nrel_indices if i not in rel_indices]
    return rel_indices, nrel_indices


# ---------------------------------------------------------------------------
# Orchestrator -- runs all three algorithms + term selection + printing
# ---------------------------------------------------------------------------

def run_relevance_feedback(query_tokens, documents, doc_products, scores):
    """
    Run all three relevance-feedback algorithms on the initial retrieval
    results and print full diagnostic output to the terminal.

    Args:
        query_tokens:  list of preprocessed query terms
        documents:     list of token-lists (one per candidate document)
        doc_products:  list of product dicts (parallel to documents)
        scores:        list of cosine-similarity scores (parallel to documents)

    Returns:
        dict mapping algorithm name -> dict with 'tokens' (the expanded
        query token list produced by top-K selection) for downstream use.
    """
    if not documents or not scores:
        print("\n  [Relevance Feedback] No documents to process -- skipping.")
        return {}

    # -- Build raw TF vectors ------------------------------------------------
    query_vec = _raw_tf_vector(query_tokens)
    doc_vecs  = [_raw_tf_vector(doc) for doc in documents]

    # -- Pseudo-relevance split ----------------------------------------------
    indexed_scores = list(enumerate(scores))
    rel_idx, nrel_idx = pseudo_relevance_split(indexed_scores)

    rel_vecs  = [doc_vecs[i] for i in rel_idx]
    nrel_vecs = [doc_vecs[i] for i in nrel_idx]

    # -- Gather all terms across query, Dr, Dn -------------------------------
    all_terms = set(query_vec.keys())
    for v in rel_vecs + nrel_vecs:
        all_terms.update(v.keys())
    all_terms = sorted(all_terms)

    # -- Compute component vectors for the table -----------------------------
    dr_centroid = _centroid(rel_vecs)
    dn_centroid = _centroid(nrel_vecs)

    # -- Run the three algorithms --------------------------------------------
    rocchio_vec = rocchio(query_vec, rel_vecs, nrel_vecs)
    ide_reg_vec = ide_regular(query_vec, rel_vecs, nrel_vecs)
    ide_dh_vec  = ide_dec_hi(query_vec, rel_vecs, nrel_vecs)

    # -- Print header --------------------------------------------------------
    sep  = "=" * 100
    thin = "-" * 100

    print("\n" + sep)
    print("  IR CONCEPT 3 -- RELEVANCE FEEDBACK (Rocchio / Ide Regular / Ide Dec-Hi)")
    print(sep)

    print("\n  Entered query:   " + " ".join(query_tokens))
    print("  Original query:  " + " ".join(query_tokens))
    print("  Feedback method: PSEUDO-RELEVANCE FEEDBACK")
    print("                   (Top %d docs -> relevant, bottom %d docs -> non-relevant)"
          % (len(rel_idx), len(nrel_idx)))
    print("  Parameters:      alpha=%.2f  beta=%.2f  gamma=%.2f" % (ALPHA, BETA, GAMMA))

    # -- Print relevant / non-relevant products ------------------------------
    print("\n  Relevant documents (Dr = %d):" % len(rel_idx))
    for i in rel_idx:
        name = doc_products[i].get("product_name", "?")
        platform = doc_products[i].get("platform", "?")
        print("    [%d] %s (%s)  --  cosine = %.4f" % (i + 1, name, platform, scores[i]))

    print("\n  Non-relevant documents (Dn = %d):" % len(nrel_idx))
    for i in nrel_idx:
        name = doc_products[i].get("product_name", "?")
        platform = doc_products[i].get("platform", "?")
        print("    [%d] %s (%s)  --  cosine = %.4f" % (i + 1, name, platform, scores[i]))

    # -- Modified query term-weight table ------------------------------------
    print("\n  " + thin)
    print("  %-18s %8s %8s %8s %10s %10s %10s" % (
        "Keyword", "Query", "Dr", "Dn", "Rocchio", "Ide_Reg", "Ide_DecHi"))
    print("  " + thin)
    for term in all_terms:
        q_w  = query_vec.get(term, 0.0)
        dr_w = dr_centroid.get(term, 0.0)
        dn_w = dn_centroid.get(term, 0.0)
        r_w  = rocchio_vec.get(term, 0.0)
        ir_w = ide_reg_vec.get(term, 0.0)
        id_w = ide_dh_vec.get(term, 0.0)
        print("  %-18s %8.4f %8.4f %8.4f %10.4f %10.4f %10.4f" % (
            term, q_w, dr_w, dn_w, r_w, ir_w, id_w))
    print("  " + thin)

    # -- Apply term selection to each algorithm ------------------------------
    algorithms = {
        "Rocchio":     rocchio_vec,
        "Ide Regular": ide_reg_vec,
        "Ide Dec-Hi":  ide_dh_vec,
    }

    selection_results = {}
    for algo_name, mod_vec in algorithms.items():
        sel = apply_term_selection(mod_vec)
        selection_results[algo_name] = sel

        print("\n  -- Thresholding: %s --" % algo_name)

        # Fixed cutoff
        fc = sel["fixed_cutoff"]
        fc_terms = sorted(fc.keys(), key=lambda t: fc[t], reverse=True)
        print("    Fixed cutoff (tau >= %.1f):" % TAU)
        if fc_terms:
            for t in fc_terms:
                print("      %-18s %.4f" % (t, fc[t]))
        else:
            print("      (no terms meet threshold)")

        # Top-K
        tk = sel["top_k"]
        tk_terms = sorted(tk.keys(), key=lambda t: tk[t], reverse=True)
        print("    Top-K (k = %d):" % K)
        if tk_terms:
            for t in tk_terms:
                print("      %-18s %.4f" % (t, tk[t]))
        else:
            print("      (no terms available)")

        # Relative cutoff
        rc = sel["relative_cutoff"]
        rc_terms = sorted(rc.keys(), key=lambda t: rc[t], reverse=True)
        max_w = max(mod_vec.values()) if mod_vec else 0
        effective_threshold = RHO * max(max_w, 0)
        print("    Relative cutoff (rho = %.1f, threshold = %.4f):" % (RHO, effective_threshold))
        if rc_terms:
            for t in rc_terms:
                print("      %-18s %.4f" % (t, rc[t]))
        else:
            print("      (no terms meet threshold)")

    # -- Final reformulated queries ------------------------------------------
    print("\n  " + thin)
    print("  FINAL REFORMULATED QUERIES (using Top-K selection)")
    print("  " + thin)

    expanded_queries = {}
    for algo_name in algorithms:
        top_k_terms = selection_results[algo_name]["top_k"]
        # Merge original query tokens with expansion terms
        expanded_tokens = list(query_tokens)
        for term in sorted(top_k_terms.keys(), key=lambda t: top_k_terms[t], reverse=True):
            if term not in expanded_tokens:
                expanded_tokens.append(term)

        # If expansion produced nothing useful, retain original
        if not expanded_tokens:
            expanded_tokens = list(query_tokens)

        expanded_queries[algo_name] = {
            "tokens": expanded_tokens,
            "top_k_terms": top_k_terms,
        }

        new_terms = [t for t in expanded_tokens if t not in query_tokens]
        print("    %-14s:  %s" % (algo_name, " ".join(expanded_tokens)))
        if new_terms:
            print("                     + added: %s" % ", ".join(new_terms))
        else:
            print("                     (no new terms added)")

    print("  " + sep + "\n")

    return expanded_queries
