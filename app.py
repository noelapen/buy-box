"""
BUY BOX — Cross-Platform Product Price Comparator
Flask backend that implements the full IR pipeline:

  Cart Product  →  Query Reformulation (IR Concept 1)
       →  Clean Query  →  Dataset Lookup
       →  Candidate Products
       →  TF-IDF + Cosine Similarity (IR Concept 2)
       →  Top-K Results  →  Same-Brand Filter
       →  Price | Rating | Reviews  →  Final Comparison
"""

import json
import math
import os
import threading
import time
from pathlib import Path
from urllib.error import URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

from flask import Flask, render_template, request

# Load .env config (API keys, etc.)
def _load_env(path):
    """Read key=value pairs from a .env file into os.environ."""
    if not path.exists():
        return
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

_load_env(Path(__file__).resolve().parent / ".env")

# IR Concept 1: Query Reformulation (preprocessing, brand extraction, filtering)
from query_reformulation import (
    CATEGORY_ALIASES,
    PRODUCT_TYPE_ALIASES,
    correct_query_tokens,
    extract_identity,
    matches_identity,
    preprocess,
    reformulate_query_with_trace,
)

# IR Concept 2: TF-IDF Vector Space Model + Cosine Similarity
from tfidf_engine import compute_tfidf_vectors

# IR Concept 3: Relevance Feedback (Rocchio / Ide Regular / Ide Dec-Hi)
from relevance_feedback import (
    ALPHA, BETA, GAMMA, TAU, K, RHO,
    _raw_tf_vector, _centroid, _sum_vectors, _scale, _add, _subtract,
    apply_term_selection,
    pseudo_relevance_split,
    rocchio, ide_regular, ide_dec_hi,
    run_relevance_feedback,
)

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "products.json"
TOP_K = 10
SHOPIT_TIMEOUT = 8        # ShopIt scrapes live sites; allow enough time
SHOPIT_CONNECT_TIMEOUT = 2  # fast-fail if ShopIt server is down
_evaluation_lock = threading.Lock()
_evaluation_totals = {
    "average_precision_by_query": {},
    "request_count": 0,
    "response_time_total": 0.0,
}

SORT_OPTIONS = {
    "best_match": "Best Match",
    "lowest_price": "Lowest Price",
    "highest_rating": "Highest Rating",
    "most_reviews": "Most Reviews",
    "most_purchased": "Most Purchased",
}

app = Flask(__name__)


# --- Data Loading ---

def load_products():
    """Load and normalize the product dataset from JSON."""
    with DATA_FILE.open(encoding="utf-8") as f:
        records = json.load(f)
    return [normalize_product(r) for r in records]


def normalize_product(record):
    """Ensure all product fields have valid defaults."""
    p = dict(record)
    p["product_name"] = p.get("product_name") or p.get("title") or "N/A"
    p["platform"] = p.get("platform") or p.get("source") or "N/A"
    p["review_count"] = p.get("review_count", p.get("rating_count"))
    p["product_url"] = p.get("product_url") or p.get("url") or "N/A"
    for field in ("price", "rating", "review_count", "purchase_count"):
        p[field] = safe_number(p.get(field))
    p["brand"] = p.get("brand") or "N/A"
    p["category"] = p.get("category") or "N/A"
    p["description"] = p.get("description") or "N/A"
    p["image"] = p.get("image") or p.get("image_url") or p.get("img") or "N/A"
    return p


def safe_number(value):
    """Parse a numeric value, returning None if invalid."""
    try:
        n = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def fetch_shopit_products(query):
    """Fetch products from the ShopIt unified search API for this request."""
    base_url = os.environ.get("SHOPIT_API_URL", "http://127.0.0.1:8000").rstrip("/")
    api_key = os.environ.get("SHOPIT_API_KEY", "")
    params = {"q": query, "source": "all"}
    if api_key:
        params["api_key"] = api_key
    url = f"{base_url}/api/search?{urlencode(params)}"
    headers = {"Accept": "application/json", "User-Agent": "BuyBox/1.0"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    req = Request(url, headers=headers)

    try:
        with urlopen(req, timeout=SHOPIT_TIMEOUT) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, OSError, ValueError) as error:
        return [], f"unavailable: {error}"

    response_groups = payload if isinstance(payload, list) else [payload]
    products = []
    for group in response_groups:
        if not isinstance(group, dict):
            continue
        for record in group.get("products", []):
            if not isinstance(record, dict):
                continue
            product = normalize_product({
                **record,
                "platform": record.get("source") or group.get("source"),
                "description": " ".join(record.get("specs", [])) if isinstance(record.get("specs"), list) else "",
            })
            if product["product_name"] != "N/A":
                products.append(product)

    if not products:
        return [], "returned no usable products"

    return products, ""


def category_candidates(products, identity):
    """Return products matching the inferred type or broad category."""
    aliases = PRODUCT_TYPE_ALIASES.get(identity["product_type"])
    if not aliases:
        aliases = CATEGORY_ALIASES.get(identity["category"], set())
    alias_tokens = set(preprocess(" ".join(aliases)))
    category_labels = {
        "footwear": {"shoes", "footwear"},
        "clothing": {"fashion", "clothing", "apparel"},
        "beauty": {"beauty"},
        "electronics": {"electronics"},
        "watches": {"watches"},
        "grocery": {"grocery"},
        "home_kitchen": {"home kitchen", "lifestyle"},
    }.get(identity["category"], set())
    label_tokens = set(preprocess(" ".join(category_labels)))

    alias_matches = []
    category_matches = []
    for product in products:
        content_tokens = set(preprocess(product["product_name"]))
        category_tokens = set(preprocess(product["category"]))
        if content_tokens.intersection(alias_tokens):
            alias_matches.append(product)
        elif category_tokens.intersection(label_tokens):
            category_matches.append(product)
    return alias_matches or category_matches


# --- Sorting & Ranking ---

def sort_products(products, sort_by):
    """Sort product list by the chosen criteria."""
    def val(p, key):
        return p.get(key)

    if sort_by == "lowest_price":
        return sorted(products, key=lambda p: (val(p, "price") is None, val(p, "price") or 0))
    if sort_by == "highest_rating":
        return sorted(products, key=lambda p: (val(p, "rating") is None, -(val(p, "rating") or 0), -(val(p, "relevance_score") or 0)))
    if sort_by == "most_reviews":
        return sorted(products, key=lambda p: (val(p, "review_count") is None, -(val(p, "review_count") or 0)))
    if sort_by == "most_purchased":
        return sorted(products, key=lambda p: (val(p, "purchase_count") is None, -(val(p, "purchase_count") or 0)))
    # Default: best match
    return sorted(products, key=lambda p: (
        -(val(p, "relevance_score") or 0),
        val(p, "price") is None,
        val(p, "price") or 0,
        -(val(p, "rating") or 0)
    ))


def calculate_ir_metrics(retrieved_indices, relevant_indices, k=TOP_K):
    """Calculate retrieval metrics from ranked candidate indices and relevance labels."""
    retrieved = list(retrieved_indices)
    retrieved_set = set(retrieved)
    relevant_set = set(relevant_indices)
    true_positives = len(retrieved_set.intersection(relevant_set))
    false_positives = len(retrieved_set - relevant_set)
    false_negatives = len(relevant_set - retrieved_set)

    precision = true_positives / len(retrieved_set) if retrieved_set else 0.0
    recall = true_positives / len(relevant_set) if relevant_set else 0.0
    f1 = (
        2 * precision * recall / (precision + recall)
        if precision + recall
        else 0.0
    )
    precision_at_k = sum(index in relevant_set for index in retrieved[:k]) / k if k else 0.0

    relevant_seen = 0
    precision_sum = 0.0
    for rank, index in enumerate(retrieved, start=1):
        if index in relevant_set:
            relevant_seen += 1
            precision_sum += relevant_seen / rank
    average_precision = precision_sum / len(relevant_set) if relevant_set else 0.0

    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "precision_at_k": precision_at_k,
        "k": k,
        "average_precision": average_precision,
        "true_positives": true_positives,
        "false_positives": false_positives,
        "false_negatives": false_negatives,
    }


def record_query_metrics(query, average_precision, response_time):
    """Update MAP per unique query and average search time per completed request."""
    with _evaluation_lock:
        query_key = " ".join(query.casefold().split())
        _evaluation_totals["average_precision_by_query"][query_key] = average_precision
        _evaluation_totals["request_count"] += 1
        _evaluation_totals["response_time_total"] += response_time
        average_precisions = _evaluation_totals["average_precision_by_query"].values()
        measured_queries = len(_evaluation_totals["average_precision_by_query"])
        measured_requests = _evaluation_totals["request_count"]
        return {
            "map": sum(average_precisions) / measured_queries if measured_queries else 0.0,
            "average_response_time": _evaluation_totals["response_time_total"] / measured_requests,
            "measured_queries": measured_queries,
            "measured_requests": measured_requests,
        }


# --- Main Search Pipeline ---

def search_products(query, sort_by="best_match"):
    """
    Full IR pipeline:
      1. Reformulate query (IR Concept 1)
      2. Extract brand/category identity
      3. Filter candidates by identity (same-brand filter)
      4. TF-IDF + Cosine Similarity scoring (IR Concept 2)
      5. Top-K selection with badges
    """
    search_start = time.perf_counter()
    diagnostics = {}

    # Step 1: Query Reformulation (IR Concept 1)
    query_tokens, query_trace = reformulate_query_with_trace(query)
    if not query_tokens:
        query_tokens = ["product"]

    print("\nQuery reformulation")
    print("Raw query:", query)
    print("After stemming:", query_trace["stemmed_tokens"])
    print("Added product terms:", query_trace["added_aliases"])
    print("Initial reformulated query:", " ".join(query_tokens))

    # --- Data source: ShopIt API first, local fallback only if needed ---
    print("\nData source: trying ShopIt API first...")
    shopit_products, fallback_reason = fetch_shopit_products(query)
    if shopit_products:
        products = shopit_products
        source_label = "Live products from ShopIt"
        data_source = "ShopIt API"
        print("ShopIt: OK — %d products received" % len(products))
    else:
        print("ShopIt: FAILED (%s) — falling back to local products.json" % fallback_reason)
        products = load_products()
        source_label = (
            "Fallback dataset (ShopIt unavailable)"
            if fallback_reason.startswith("unavailable")
            else "Fallback dataset (ShopIt returned no usable results)"
        )
        data_source = "products.json (local fallback)"

    # Step 2: Extract product identity (brand, category, product type)
    identity = extract_identity(query, products)

    # Step 3: Narrow to an exact known brand or category when possible.
    eligible = products
    if identity["brand"]:
        brand_tokens = set(preprocess(identity["brand"]))
        brand_matches = [
            product for product in products
            if set(preprocess(product["brand"])) == brand_tokens
        ]
        if brand_matches:
            eligible = brand_matches
    category_matches = category_candidates(products, identity) if identity["category"] else []
    if category_matches:
        scoped_matches = [product for product in eligible if product in category_matches]
        eligible = scoped_matches or (category_matches if not identity["brand"] else eligible)

    # Step 4: TF-IDF + Cosine Similarity (IR Concept 2)
    documents = [
        preprocess(" ".join((p["product_name"], p["brand"], p["category"], p["description"])))
        for p in eligible
    ]
    document_terms = {token for document in documents for token in document}
    query_tokens, corrections = correct_query_tokens(
        query_trace["stemmed_tokens"],
        document_terms,
    )
    if not query_tokens:
        query_tokens = ["product"]
    print("Spelling corrections:", corrections or "none")
    print("Reformulated query used for cosine:", " ".join(query_tokens))

    scores, vectors = compute_tfidf_vectors(query_tokens, documents, include_vectors=True)
    has_matches = any(score > 0 for score in scores)
    relevant_indices, _ = pseudo_relevance_split(list(enumerate(scores)))

    print("\nIR search (initial ranking)")
    print("Brand/category/type:", identity["brand"] or "-", identity["category"] or "-", identity["product_type"] or "-")
    print("Product source:", source_label)
    print("Candidates:", len(eligible))
    print("Query TF-IDF vector:", vectors["query_vector"])
    print("Product cosine scores:")
    unmatched_query_terms = sorted(set(query_tokens) - document_terms)
    if unmatched_query_terms:
        print("Query terms not found in product text:", unmatched_query_terms)
    for product, score in sorted(
        zip(eligible, scores), key=lambda item: item[1], reverse=True
    )[:20]:
        print(f"  {product['product_name']} ({product['platform']}): {score:.4f}")

    # -- IR Concept 3: Relevance Feedback ------------------------------------
    # Run once and collect both expanded queries and diagnostics in one pass
    expanded_queries, rf_diagnostics = _run_relevance_feedback_with_diagnostics(
        query_tokens, documents, eligible, scores
    )

    # Re-rank with the Rocchio-expanded query (use Top-K selection)
    final_query_tokens = query_tokens  # default: original
    if has_matches and expanded_queries and "Rocchio" in expanded_queries:
        rocchio_tokens = expanded_queries["Rocchio"]["tokens"]
        if rocchio_tokens:
            final_query_tokens = rocchio_tokens

    used_expansion = final_query_tokens != query_tokens

    if used_expansion:
        print("\nRe-ranking with Rocchio-expanded query:", " ".join(final_query_tokens))
        expanded_scores, expanded_vectors = compute_tfidf_vectors(
            final_query_tokens, documents, include_vectors=True
        )
        print("\n" + "=" * 100)
        print("  FINAL TF-IDF + COSINE SIMILARITY RANKING (after Rocchio expansion)")
        print("=" * 100)
        print(f"  Expanded query vector: {expanded_vectors['query_vector']}")
        for product, score in sorted(
            zip(eligible, expanded_scores), key=lambda item: item[1], reverse=True
        )[:20]:
            print(f"    {product['product_name']} ({product['platform']}): {score:.4f}")
        results = [
            {**product, "_candidate_index": index, "relevance_score": score, "badges": []}
            for index, (product, score) in enumerate(zip(eligible, expanded_scores))
        ] if has_matches else []
        final_scores = expanded_scores
        final_vectors = expanded_vectors
    else:
        print("\n" + "=" * 100)
        print("  FINAL TF-IDF + COSINE SIMILARITY RANKING (original query -- no expansion)")
        print("=" * 100)
        for product, score in sorted(
            zip(eligible, scores), key=lambda item: item[1], reverse=True
        )[:20]:
            print(f"    {product['product_name']} ({product['platform']}): {score:.4f}")
        results = [
            {**product, "_candidate_index": index, "relevance_score": score, "badges": []}
            for index, (product, score) in enumerate(zip(eligible, scores))
        ] if has_matches else []
        final_scores = scores
        final_vectors = vectors

    results = sort_products(results, "best_match")[:TOP_K]
    ir_metrics = calculate_ir_metrics(
        [product["_candidate_index"] for product in results],
        relevant_indices,
    )

    print("\nTop results:")
    for product in results:
        print(f"  {product['product_name']} | price={product['price']} | cosine={product['relevance_score']:.4f}")

    # Assign badges
    if results:
        results[0]["badges"].extend(("BEST MATCH", "BEST CHOICE"))
    priced = [product for product in results if product["price"] is not None]
    rated = [product for product in results if product["rating"] is not None]
    if priced:
        min(priced, key=lambda product: product["price"])["badges"].append("LOWEST PRICE")
    if rated:
        max(rated, key=lambda product: (product["rating"], product["review_count"] or 0))["badges"].append("HIGHEST RATED")

    # Final sort by user-selected criteria
    results = sort_products(results, sort_by)
    for product in results:
        product.pop("_candidate_index", None)
    matched_platforms = {p["platform"] for p in results}
    all_platforms = {p["platform"] for p in eligible if p["platform"] != "N/A"}

    search_elapsed = time.perf_counter() - search_start

    # --- Build diagnostics for the frontend analysis panel ---
    # A. Search Request
    diagnostics["search_request"] = {
        "original_query": query,
        "api_endpoint": os.environ.get("SHOPIT_API_URL", "http://127.0.0.1:8000") + "/api/search",
        "data_source": data_source,
        "products_retrieved": len(products),
        "candidates_after_filter": len(eligible),
        "response_time_ms": round(search_elapsed * 1000, 2),
    }

    # B. Query Reformulation
    diagnostics["query_reformulation"] = {
        "lowercase": query_trace["lowercase"],
        "tokens": query_trace["tokens"],
        "removed_stop_words": query_trace["removed_stop_words"],
        "filtered_tokens": query_trace["filtered_tokens"],
        "stemmed_tokens": query_trace["stemmed_tokens"],
        "matched_alias_group": query_trace.get("matched_alias_group", "N/A"),
        "added_aliases": query_trace.get("added_aliases", []),
        "spelling_corrections": corrections or {},
        "detected_brand": identity["brand"] or "N/A",
        "detected_category": identity["category"] or "N/A",
        "detected_product_type": identity.get("product_type", "N/A") or "N/A",
        "final_query_tokens": query_tokens,
        "final_query": " ".join(query_tokens),
    }

    # C. Relevance Feedback
    diagnostics["relevance_feedback"] = rf_diagnostics

    # D. TF-IDF and Cosine Similarity
    tfidf_product_scores = []
    scored_products = zip(eligible, final_scores) if has_matches else ()
    for i, (product, score) in enumerate(scored_products):
        entry = {
            "name": product["product_name"],
            "platform": product["platform"],
            "cosine": round(score, 4),
        }
        # Include doc vector for top products only (to keep payload small)
        if i < 5 and i < len(final_vectors.get("document_vectors", [])):
            raw_vec = final_vectors["document_vectors"][i]
            entry["doc_vector"] = {k: round(v, 4) for k, v in sorted(raw_vec.items(), key=lambda x: -x[1])[:8]}
        tfidf_product_scores.append(entry)
    tfidf_product_scores.sort(key=lambda x: x["cosine"], reverse=True)
    tfidf_product_score_count = len(tfidf_product_scores)

    diagnostics["tfidf"] = {
        "query_vector": {k: round(v, 4) for k, v in sorted(
            final_vectors["query_vector"].items(), key=lambda x: -x[1]
        )},
        "used_expansion": used_expansion,
        "expanded_query": " ".join(final_query_tokens) if used_expansion else None,
        "product_score_count": tfidf_product_score_count,
        "product_scores": tfidf_product_scores[:20],
    }

    # E. Final Results summary
    diagnostics["final_results"] = [
        {
            "rank": i + 1,
            "name": r["product_name"],
            "platform": r["platform"],
            "price": r["price"],
            "rating": r["rating"],
            "relevance_score": round(r.get("relevance_score", 0), 4),
            "badges": r.get("badges", []),
        }
        for i, r in enumerate(results)
    ]

    print("Source and final retrieved count:", source_label, len(results))
    return {
        "results": results,
        "message": "" if results else f'No matching products found for "{query}".',
        "platform_count": len(matched_platforms),
        "missing_platforms": sorted(all_platforms - matched_platforms),
        "source_label": source_label,
        "metrics": ir_metrics,
        "diagnostics": diagnostics,
    }


def _run_relevance_feedback_with_diagnostics(query_tokens, documents, doc_products, scores):
    """Run relevance feedback AND collect diagnostics in a single pass.

    Returns (expanded_queries, diagnostics_dict) — avoids running the
    three RF algorithms twice.
    """
    if not documents or not scores:
        print("\n  [Relevance Feedback] No documents to process -- skipping.")
        return {}, {"available": False}

    query_vec = _raw_tf_vector(query_tokens)
    doc_vecs = [_raw_tf_vector(doc) for doc in documents]
    indexed_scores = list(enumerate(scores))
    rel_idx, nrel_idx = pseudo_relevance_split(indexed_scores)
    rel_vecs = [doc_vecs[i] for i in rel_idx]
    nrel_vecs = [doc_vecs[i] for i in nrel_idx]

    # Run the three algorithms (once)
    rocchio_vec = rocchio(query_vec, rel_vecs, nrel_vecs)
    ide_reg_vec = ide_regular(query_vec, rel_vecs, nrel_vecs)
    ide_dh_vec = ide_dec_hi(query_vec, rel_vecs, nrel_vecs)

    # Term selection for each
    rocchio_sel = apply_term_selection(rocchio_vec)
    ide_reg_sel = apply_term_selection(ide_reg_vec)
    ide_dh_sel = apply_term_selection(ide_dh_vec)

    algorithms = {
        "Rocchio":     (rocchio_vec, rocchio_sel),
        "Ide Regular": (ide_reg_vec, ide_reg_sel),
        "Ide Dec-Hi":  (ide_dh_vec, ide_dh_sel),
    }

    # --- Console output (same as run_relevance_feedback) -----------------
    sep  = "=" * 100
    thin = "-" * 100
    print("\n" + sep)
    print("  IR CONCEPT 3 -- RELEVANCE FEEDBACK (Rocchio / Ide Regular / Ide Dec-Hi)")
    print(sep)
    print("\n  Entered query:   " + " ".join(query_tokens))
    print("  Feedback method: PSEUDO-RELEVANCE FEEDBACK")
    print("                   (Top %d docs -> relevant, bottom %d docs -> non-relevant)"
          % (len(rel_idx), len(nrel_idx)))
    print("  Parameters:      alpha=%.2f  beta=%.2f  gamma=%.2f" % (ALPHA, BETA, GAMMA))

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

    # Keyword table
    dr_centroid = _centroid(rel_vecs)
    dn_centroid = _centroid(nrel_vecs)
    all_terms = set(query_vec.keys())
    for v in rel_vecs + nrel_vecs:
        all_terms.update(v.keys())
    all_terms = sorted(all_terms)

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

    # Thresholding + expanded queries
    expanded_queries = {}
    for algo_name, (mod_vec, sel) in algorithms.items():
        print("\n  -- Thresholding: %s --" % algo_name)
        fc = sel["fixed_cutoff"]
        fc_terms = sorted(fc.keys(), key=lambda t: fc[t], reverse=True)
        print("    Fixed cutoff (tau >= %.1f):" % TAU)
        for t in fc_terms:
            print("      %-18s %.4f" % (t, fc[t]))
        if not fc_terms:
            print("      (no terms meet threshold)")
        tk = sel["top_k"]
        tk_terms = sorted(tk.keys(), key=lambda t: tk[t], reverse=True)
        print("    Top-K (k = %d):" % K)
        for t in tk_terms:
            print("      %-18s %.4f" % (t, tk[t]))
        if not tk_terms:
            print("      (no terms available)")
        rc = sel["relative_cutoff"]
        rc_terms = sorted(rc.keys(), key=lambda t: rc[t], reverse=True)
        max_w = max(mod_vec.values()) if mod_vec else 0
        effective_threshold = RHO * max(max_w, 0)
        print("    Relative cutoff (rho = %.1f, threshold = %.4f):" % (RHO, effective_threshold))
        for t in rc_terms:
            print("      %-18s %.4f" % (t, rc[t]))
        if not rc_terms:
            print("      (no terms meet threshold)")

        # Build expanded query
        top_k_terms = sel["top_k"]
        expanded_tokens = list(query_tokens)
        for term in sorted(top_k_terms.keys(), key=lambda t: top_k_terms[t], reverse=True):
            if term not in expanded_tokens:
                expanded_tokens.append(term)
        if not expanded_tokens:
            expanded_tokens = list(query_tokens)
        expanded_queries[algo_name] = {
            "tokens": expanded_tokens,
            "top_k_terms": top_k_terms,
        }

    print("\n  " + thin)
    print("  FINAL REFORMULATED QUERIES (using Top-K selection)")
    print("  " + thin)
    for algo_name in algorithms:
        tokens = expanded_queries[algo_name]["tokens"]
        new_terms = [t for t in tokens if t not in query_tokens]
        print("    %-14s:  %s" % (algo_name, " ".join(tokens)))
        if new_terms:
            print("                     + added: %s" % ", ".join(new_terms))
        else:
            print("                     (no new terms added)")
    print("  " + sep + "\n")

    # --- Build diagnostics dict for the frontend -------------------------
    def _format_vec(vec, top_n=10):
        return {k: round(v, 4) for k, v in sorted(vec.items(), key=lambda x: -x[1])[:top_n]}

    def _format_selection(sel):
        return {
            "fixed_cutoff": _format_vec(sel["fixed_cutoff"]),
            "top_k": _format_vec(sel["top_k"]),
            "relative_cutoff": _format_vec(sel["relative_cutoff"]),
        }

    rel_docs = [
        {"rank": i + 1, "name": doc_products[i].get("product_name", "?"),
         "platform": doc_products[i].get("platform", "?"), "cosine": round(scores[i], 4)}
        for i in rel_idx
    ]
    nrel_docs = [
        {"rank": i + 1, "name": doc_products[i].get("product_name", "?"),
         "platform": doc_products[i].get("platform", "?"), "cosine": round(scores[i], 4)}
        for i in nrel_idx
    ]
    keyword_table = [
        {"term": term,
         "query": round(query_vec.get(term, 0.0), 4),
         "dr": round(dr_centroid.get(term, 0.0), 4),
         "dn": round(dn_centroid.get(term, 0.0), 4),
         "rocchio": round(rocchio_vec.get(term, 0.0), 4),
         "ide_reg": round(ide_reg_vec.get(term, 0.0), 4),
         "ide_dh": round(ide_dh_vec.get(term, 0.0), 4)}
        for term in all_terms
    ]

    diagnostics = {
        "available": True,
        "feedback_method": "Pseudo-Relevance Feedback",
        "parameters": {
            "alpha": ALPHA, "beta": BETA, "gamma": GAMMA,
            "tau": TAU, "k": K, "rho": RHO,
        },
        "relevant_docs": rel_docs,
        "non_relevant_docs": nrel_docs,
        "reformulated_queries": {
            name: " ".join(query["tokens"])
            for name, query in expanded_queries.items()
        },
        "keyword_table": keyword_table,
        "algorithms": {
            name: {
                "modified_vector": _format_vec(vec),
                "selection": _format_selection(sel),
            }
            for name, (vec, sel) in algorithms.items()
        },
    }

    return expanded_queries, diagnostics

#product urls
def product_search_url(product):
    """Generate a search URL for the product on its platform."""
    if product["product_url"] != "N/A":
        return product["product_url"]
    q = quote(product["product_name"])
    urls = {
        "Amazon": f"https://www.amazon.in/s?k={q}",
        "Flipkart": f"https://www.flipkart.com/search?q={q}",
        "Myntra": f"https://www.myntra.com/{q}",
        "Ajio": f"https://www.ajio.com/search/?text={q}",
        "Meesho": f"https://www.meesho.com/search/{q}",
        "Nykaa": f"https://www.nykaa.com/search/?q={q}",
        "BigBasket": f"https://www.bigbasket.com/ps/?q={q}",
        "Blinkit": f"https://blinkit.com/s/?q={q}",
    }
    return urls.get(product["platform"], "")


# --- Routes ---

@app.get("/")
def home():
    query = request.args.get("q", "").strip()[:200]
    sort_by = request.args.get("sort", "best_match")
    if sort_by not in SORT_OPTIONS:
        sort_by = "best_match"
    comparison = None
    if query:
        search_started = time.perf_counter()
        comparison = search_products(query, sort_by)
        search_elapsed = time.perf_counter() - search_started
        comparison["metrics"].update(
            record_query_metrics(
                query,
                comparison["metrics"]["average_precision"],
                search_elapsed,
            )
        )
    status_message = ""
    if comparison:
        if comparison["source_label"] == "Live products from ShopIt":
            status_message = "Live results loaded from ShopIt."
        else:
            status_message = "Showing local results because live search was unavailable."
    return render_template(
        "index.html",
        query=query,
        sort_by=sort_by,
        sort_options=SORT_OPTIONS,
        comparison=comparison,
        product_search_url=product_search_url,
        status_message=status_message,
    )


if __name__ == "__main__":
    app.run(debug=True)
