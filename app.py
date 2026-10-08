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
    extract_identity,
    preprocess,
    reformulate_query,
)

# IR Concept 2: TF-IDF Vector Space Model + Cosine Similarity
from tfidf_engine import compute_tfidf_vectors

ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "products.json"
TOP_K = 10
SHOPIT_TIMEOUT = 4

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
    """Fetch live products from the ShopIt unified search API."""
    base_url = os.environ.get("SHOPIT_API_URL", "http://127.0.0.1:8000").rstrip("/")
    api_key = os.environ.get("SHOPIT_API_KEY", "")
    params = {"q": query, "source": "all"}
    if api_key:
        params["api_key"] = api_key
    url = f"{base_url}/api/search?{urlencode(params)}"
    headers = {"Accept": "application/json", "User-Agent": "BuyBox/1.0"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = Request(url, headers=headers)

    try:
        with urlopen(request, timeout=SHOPIT_TIMEOUT) as response:
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
    # Step 1: Query Reformulation (IR Concept 1)
    query_tokens = reformulate_query(query)
    if not query_tokens:
        query_tokens = ["product"]

    shopit_products, fallback_reason = fetch_shopit_products(query)
    if shopit_products:
        products = shopit_products
        source_label = "Live products from ShopIt"
    else:
        products = load_products()
        source_label = (
            "Fallback dataset (ShopIt unavailable)"
            if fallback_reason.startswith("unavailable")
            else "Fallback dataset (ShopIt returned no usable results)"
        )
        print("ShopIt fallback reason:", fallback_reason)

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
    scores, vectors = compute_tfidf_vectors(query_tokens, documents, include_vectors=True)
    results = [
        {**product, "relevance_score": score, "badges": []}
        for product, score in zip(eligible, scores)
    ]
    results = sort_products(results, "best_match")[:TOP_K]

    # Keep a console-only trace for the IR demonstration.
    print("\\n=== BUY BOX IR SEARCH ===")
    print("Query Reformulation - raw:", query)
    print("Query Reformulation - processed:", " ".join(query_tokens))
    print("Product source:", source_label)
    print("Candidate products:", len(eligible))
    print("TF-IDF query vector:", json.dumps(vectors["query_vector"], sort_keys=True))
    for product, score, vector in zip(eligible, scores, vectors["document_vectors"]):
        print(
            "TF-IDF document:", product["product_name"],
            "| values:", json.dumps(vector, sort_keys=True),
            "| cosine:", f"{score:.6f}",
        )
    print("Retrieved results:")
    for product in results:
        print(
            f"  {product['product_name']} | {product['platform']} | "
            f"price={product['price']} | cosine={product['relevance_score']:.6f}"
        )

    # Assign badges
    results[0]["badges"].extend(("BEST MATCH", "BEST CHOICE"))
    priced = [product for product in results if product["price"] is not None]
    rated = [product for product in results if product["rating"] is not None]
    if priced:
        min(priced, key=lambda product: product["price"])["badges"].append("LOWEST PRICE")
    if rated:
        max(rated, key=lambda product: (product["rating"], product["review_count"] or 0))["badges"].append("HIGHEST RATED")

    # Final sort by user-selected criteria
    results = sort_products(results, sort_by)
    matched_platforms = {p["platform"] for p in results}
    all_platforms = {p["platform"] for p in eligible if p["platform"] != "N/A"}

    print("Source and final retrieved count:", source_label, len(results))
    return {
        "results": results,
        "message": "",
        "platform_count": len(matched_platforms),
        "missing_platforms": sorted(all_platforms - matched_platforms),
        "source_label": source_label,
    }

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
    comparison = search_products(query, sort_by) if query else None
    return render_template(
        "index.html",
        query=query,
        sort_by=sort_by,
        sort_options=SORT_OPTIONS,
        comparison=comparison,
        product_search_url=product_search_url,
    )


if __name__ == "__main__":
    app.run(debug=True)
