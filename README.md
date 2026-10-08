# BUY BOX - Product Price Comparator

BuyBox is a small Flask application with an HTML/CSS frontend. It searches ShopIt's Amazon India and Flipkart API first, then automatically uses the included product catalog when ShopIt is unavailable or has no usable results. Query Reformulation and TF-IDF/Cosine Similarity run in Python; their demonstration trace is printed in the server terminal, not shown in the page.

---

## Problem Statement

Online shoppers face the challenge of comparing product offers across e-commerce platforms. Manually checking each platform is time-consuming and inefficient.

**BUY BOX** retrieves relevant products for both broad category searches and specific brand/model searches, then compares prices, ratings, and review counts.

---

## Objectives

1. Implement a text-based Information Retrieval system using TF-IDF and Cosine Similarity
2. Build a product comparison engine that evaluates products on multiple attributes
3. Demonstrate the complete IR pipeline: Query Processing → Vectorization → Similarity → Retrieval → Ranking
4. Retrieve live product listings through the ShopIt API
5. Fall back automatically to a local dataset when live results are unavailable

---

## Algorithm — TF-IDF + Cosine Similarity

### Query Processing Pipeline

```
Input: "Nike Black Running Shoes for Men"
  ↓ Lowercase
"nike black running shoes for men"
  ↓ Tokenize
["nike", "black", "running", "shoes", "for", "men"]
  ↓ Remove Stop Words
["nike", "black", "running", "shoes", "men"]
  ↓ Stem (Porter Stemmer)
["nike", "black", "run", "shoe", "men"]
  ↓ Join
Output: "nike black run shoe men"
```

### TF-IDF Vectorization

```
TF(t, d) = (count of t in d) / (total terms in d)
IDF(t) = log((N + 1) / (df + 1)) + 1
TF-IDF(t, d) = TF(t, d) × IDF(t)
```

### Cosine Similarity

```
Cosine Similarity(Q, D) = (Q · D) / (||Q|| × ||D||)
```

### Ranking

- **BEST MATCH** — Highest cosine similarity
- **LOWEST PRICE** — Minimum price
- **HIGHEST RATED** — Best rating (review count as tiebreaker)

---

## Architecture

The Flask route sends the raw query to ShopIt's unified `/api/search` endpoint. Usable ShopIt products become the primary corpus; otherwise `products.json` is loaded. Both paths use the same query reformulation, category/brand matching, TF-IDF and cosine ranking. The HTML form submits with GET, so the frontend requires no JavaScript.

---

## Technology Stack

| Layer          | Technology                       |
| -------------- | -------------------------------- |
| Layer          | Technology                         |
| -------------- | ---------------------------------- |
| Backend        | Python, Flask                      |
| Frontend       | HTML forms, Jinja templates, CSS   |
| IR Engine      | Query Reformulation, TF-IDF, Cosine |
| Live Data      | ShopIt unified search API          |
| Fallback       | Local JSON product catalog         |

---

## Project Structure

```
Buy Box/
├── app.py
├── query_reformulation.py
├── tfidf_engine.py
├── products.json
├── templates/index.html
├── static/style.css
└── README.md
```

---

## Setup Instructions

### Run BuyBox

```bash
python -m pip install Flask
python app.py
```

Open `http://127.0.0.1:5000` in a browser.

### Run ShopIt (optional, primary source)

Run the ShopIt API in a separate terminal, using its setup instructions at [bipash25/ShopIt](https://github.com/bipash25/ShopIt). Its default address is `http://127.0.0.1:8000`; BuyBox requests `/api/search?q=...&source=all`.

To use a different API address, set `SHOPIT_API_URL` before starting BuyBox:

```powershell
$env:SHOPIT_API_URL = "http://127.0.0.1:8000"
python app.py
```

ShopIt needs no API key. If it is stopped, times out, fails, or returns no usable products, BuyBox uses `products.json` and labels those results as fallback data.

---

## Data Sources

| Source | Coverage | Requires |
|--------|----------|----------|
| ShopIt API | Live Amazon India and Flipkart listings | ShopIt running locally or at configured URL |
| Fallback dataset | Local product offers, including cups and kurtis | Nothing |

---

## User Flow

1. Enter a category such as `cup`, `kurti`, or `shoes`, or a specific brand and model.
2. BuyBox searches ShopIt, falling back to the local catalog when needed.
3. Compare the ranked products by price, rating, and reviews; choose a sort order.
4. Inspect the server terminal for query reformulation, TF-IDF vectors, cosine scores, and retrieved-result diagnostics.

---

## Example Queries

| Query                     | Expected Results               |
| ------------------------- | ------------------------------ |
| cup | Cup and mug listings |
| kurti | Kurti listings |
| shoes | Shoe listings |
| Nike Revolution 6 | Nike model listings |

---

## License

This project is created for academic purposes as a final-year Information Retrieval project.
