"""
IR CONCEPT 1 — QUERY REFORMULATION
Transforms raw cart product text into a clean, normalized search query.

Pipeline:
  Raw Input → Lowercase → Tokenize → Remove Punctuation → Remove Stop Words → Stem → Clean Query

Example:
  "Nike Black Running Shoes for Men"
  → lowercase:   "nike black running shoes for men"
  → tokenize:    ["nike", "black", "running", "shoes", "for", "men"]
  → stop words:  ["nike", "black", "running", "shoes", "men"]
  → stemming:    ["nike", "black", "run", "shoe", "men"]
  → output:      "nike black run shoe men"

Also extracts product identity (brand, category) from the query
and filters candidates to same-brand matches.
"""

import re


# --- Stop Words ---
# Common English words removed during preprocessing because they carry
# no discriminative value for product matching (same set as NLTK).
STOP_WORDS = set(
    "a an the and but if or because as until while of at by for with about against "
    "between through during before after above below to from up down in out on off "
    "over under again further then once here there when where why how all both each "
    "few more most other some such no nor not only own same so than too very i me my "
    "we our you your he him his she her it they them their what which who whom this "
    "that these those am is are was were be been being have has had having do does did "
    "doing can will just should now".split()
)


# --- Porter Stemmer (full implementation) ---
# Reduces English words to their root/stem form so that morphological
# variants map to the same token during matching.
# Examples: "running" → "run", "shoes" → "shoe", "comfortable" → "comfort"

def _is_vowel(ch):
    """Check if a character is a vowel (a, e, i, o, u)."""
    return ch in "aeiou"


def _has_vowel(stem):
    """Return True if the stem contains at least one vowel."""
    return any(_is_vowel(ch) for ch in stem)


def _measure(stem):
    """
    Compute the 'measure' (m) of a stem — the number of vowel-consonant
    sequences. This is the core metric of the Porter algorithm that
    determines which suffix-stripping rules apply.
    Example: "tr" → 0, "tree" → 0, "trouble" → 1, "troubles" → 2
    """
    m, i, n = 0, 0, len(stem)
    # Skip leading consonants
    while i < n and not _is_vowel(stem[i]):
        i += 1
    while i < n:
        # Skip vowels
        while i < n and _is_vowel(stem[i]):
            i += 1
        if i < n:
            m += 1
            # Skip consonants
            while i < n and not _is_vowel(stem[i]):
                i += 1
    return m


def _ends_cvc(stem):
    """
    Check if stem ends with consonant-vowel-consonant pattern
    where the final consonant is not w, x, or y.
    Used in short-stem protection rules.
    """
    if len(stem) < 3:
        return False
    c1, v, c2 = stem[-3], stem[-2], stem[-1]
    return not _is_vowel(c1) and _is_vowel(v) and not _is_vowel(c2) and c2 not in "wxy"


def _step1b_cleanup(word):
    """Post step-1b cleanup: handle AT→ATE, BL→BLE, IZ→IZE, double letters, short stems."""
    if word.endswith(("at", "bl", "iz")):
        return word + "e"
    if len(word) >= 2 and word[-1] == word[-2] and not _is_vowel(word[-1]) and word[-1] not in "lsz":
        return word[:-1]
    if _measure(word) == 1 and _ends_cvc(word):
        return word + "e"
    return word


def porter_stem(word):
    """
    Full Porter Stemming Algorithm implementation.
    Applies 5 steps of suffix stripping rules based on the 'measure'
    of the resulting stem. This is the standard algorithm used in
    Information Retrieval for term normalization.
    """
    if len(word) <= 2:
        return word

    # Step 1a: Plurals
    if word.endswith("sses"):
        word = word[:-2]
    elif word.endswith("ies"):
        word = word[:-2]
    elif not word.endswith("ss") and word.endswith("s"):
        word = word[:-1]

    # Step 1b: Past tense / progressive (-eed, -ed, -ing)
    if word.endswith("eed"):
        stem = word[:-3]
        if _measure(stem) > 0:
            word = word[:-1]
    elif word.endswith("ed") and _has_vowel(word[:-2]):
        word = _step1b_cleanup(word[:-2])
    elif word.endswith("ing") and _has_vowel(word[:-3]):
        word = _step1b_cleanup(word[:-3])

    # Step 1c: Y → I when stem has a vowel
    if word.endswith("y") and _has_vowel(word[:-1]):
        word = word[:-1] + "i"

    # Step 2: Map double suffixes to single
    step2 = {
        "ational": "ate", "tional": "tion", "enci": "ence", "anci": "ance",
        "izer": "ize", "abli": "able", "alli": "al", "entli": "ent",
        "eli": "e", "ousli": "ous", "ization": "ize", "ation": "ate",
        "ator": "ate", "alism": "al", "iveness": "ive", "fulness": "ful",
        "ousness": "ous", "aliti": "al", "iviti": "ive", "biliti": "ble",
    }
    for suffix, replacement in step2.items():
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 0:
                word = stem + replacement
            break

    # Step 3: Handle -icate, -ative, -alize, etc.
    step3 = {
        "icate": "ic", "ative": "", "alize": "al",
        "iciti": "ic", "ical": "ic", "ful": "", "ness": "",
    }
    for suffix, replacement in step3.items():
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 0:
                word = stem + replacement
            break

    # Step 4: Remove suffixes (requires m > 1)
    step4 = [
        "al", "ance", "ence", "er", "ic", "able", "ible", "ant", "ement",
        "ment", "ent", "ion", "ou", "ism", "ate", "iti", "ous", "ive", "ize",
    ]
    for suffix in step4:
        if word.endswith(suffix):
            stem = word[: -len(suffix)]
            if _measure(stem) > 1:
                if suffix == "ion":
                    if stem.endswith(("s", "t")):
                        word = stem
                else:
                    word = stem
            break

    # Step 5a: Remove final 'e'
    if word.endswith("e"):
        stem = word[:-1]
        m = _measure(stem)
        if m > 1 or (m == 1 and not _ends_cvc(stem)):
            word = stem

    # Step 5b: Remove double 'l'
    if word.endswith("ll") and _measure(word[:-1]) > 1:
        word = word[:-1]

    return word


# --- Text Preprocessing ---

def preprocess(text):
    """
    Core NLP preprocessing pipeline for Information Retrieval.
    Steps:
      1. Lowercase — case-insensitive matching
      2. Tokenize — extract alphabetic tokens via regex
      3. Stop-word removal — discard non-discriminative words
      4. Stemming — reduce words to root forms via Porter Stemmer
    Returns a list of stemmed tokens.
    """
    # Step 1: Lowercase
    text = str(text or "").lower()
    # Step 2: Tokenize (only alphabetic sequences)
    tokens = re.findall(r"[a-z]+", text)
    # Step 3: Remove stop words
    filtered = [t for t in tokens if t not in STOP_WORDS]
    # Step 4: Porter stemming
    stemmed = [porter_stem(t) for t in filtered]
    return stemmed


def reformulate_query(raw_query):
    """
    IR Concept 1: Reformulate a raw user query into a clean search query.
    Applies preprocessing and adds close category synonyms for broader recall.
    """
    tokens = preprocess(raw_query)
    token_set = set(tokens)
    for aliases in PRODUCT_TYPE_ALIASES.values():
        alias_tokens = set(preprocess(" ".join(aliases)))
        if token_set.intersection(alias_tokens):
            tokens.extend(sorted(alias_tokens - token_set))
            break
    return tokens


# --- Brand / Category Aliases ---
# Maps broad categories to keyword aliases for matching
CATEGORY_ALIASES = {
    "footwear": {"shoe", "sneaker", "footwear", "boot", "trainer"},
    "clothing": {"robe", "bathrobe", "bath", "shirt", "tshirt", "dress", "jacket", "jean", "clothing", "apparel", "kurti", "kurta", "tunic", "ethnic"},
    "beauty": {"shampoo", "conditioner", "cream", "lipstick", "foundation", "beauty", "skincare"},
    "electronics": {"phone", "mobile", "laptop", "headphone", "earbud", "electronics"},
    "watches": {"watch", "timepiece", "dial", "analog", "digital", "chronograph", "wristwatch"},
    "grocery": {"tea", "coffee", "rice", "noodle", "grocery", "food"},
    "home_kitchen": {"cup", "mug", "tumbler", "drinkware"},
}

# More specific product-type aliases
PRODUCT_TYPE_ALIASES = {
    "footwear": CATEGORY_ALIASES["footwear"],
    "phone": {"phone", "mobile", "smartphone"},
    "audio": {"headphone", "earbud", "earphone"},
    "watches": CATEGORY_ALIASES["watches"],
    "foundation": {"foundation"},
    "noodles": {"noodle"},
    "clothing": {"kurti", "kurta", "tunic"},
    "home_kitchen": CATEGORY_ALIASES["home_kitchen"],
}


# --- Identity Extraction ---

def extract_identity(query, candidates):
    """
    Extract product identity (brand, category, product type) from the query.
    Uses the candidate product list to match known brands.
    Returns a dict with brand, category, product_type, query_tokens, product_tokens.
    """
    query_tokens = set(preprocess(query))

    # Collect all known brands from candidates
    known_brands = {
        str(p.get("brand", "")).strip()
        for p in candidates
        if p.get("brand") and str(p["brand"]).lower() != "n/a"
    }

    # Try to match a brand from the query text
    normalized_query = " ".join(preprocess(query))
    brand = next(
        iter(sorted(
            (b for b in known_brands if " ".join(preprocess(b)) in normalized_query),
            key=len, reverse=True
        )),
        "",
    )

    # Match category and product type
    category = next(
        (name for name, aliases in CATEGORY_ALIASES.items()
         if query_tokens.intersection(preprocess(" ".join(aliases)))),
        "",
    )
    product_type = next(
        (name for name, aliases in PRODUCT_TYPE_ALIASES.items()
         if query_tokens.intersection(preprocess(" ".join(aliases)))),
        "",
    )

    brand_tokens = set(preprocess(brand))
    return {
        "brand": brand,
        "category": category,
        "product_type": product_type,
        "query_tokens": query_tokens,
        "product_tokens": query_tokens - brand_tokens,
    }


# --- Same-Brand Filter ---

def matches_identity(product, identity):
    """
    Check if a product matches the extracted identity.
    Requires: same brand, matching category/type, and title token overlap.
    This is the same-brand filter step in the pipeline.
    """
    # Brand must match
    if not identity["brand"] or preprocess(product.get("brand")) != preprocess(identity["brand"]):
        return False

    # Category/type check
    searchable = " ".join((
        product.get("product_name", ""),
        product.get("category", ""),
        product.get("description", ""),
    ))
    product_tokens = set(preprocess(searchable))
    aliases = PRODUCT_TYPE_ALIASES.get(identity["product_type"], set())
    if not aliases and identity["category"]:
        aliases = CATEGORY_ALIASES[identity["category"]]
    if aliases and not product_tokens.intersection(preprocess(" ".join(aliases))):
        return False

    # At least one meaningful product token must appear in title/description
    title_tokens = set(preprocess(f"{product.get('product_name', '')} {product.get('description', '')}"))
    meaningful = {t for t in identity["product_tokens"] if len(t) > 2}
    return bool(title_tokens.intersection(meaningful))
