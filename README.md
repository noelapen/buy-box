# BUY BOX — Smart Shopping Comparison Chrome Extension

> **Compare Smart. Shop Better.**

A Chrome Extension powered by Information Retrieval that compares products across multiple e-commerce platforms using **TF-IDF + Cosine Similarity**, then ranks results with a weighted scoring system — all running entirely in the browser.

---

## Problem Statement

Online shoppers face the challenge of comparing the same product across multiple e-commerce platforms (Amazon, Flipkart, Myntra, etc.) to find the best deal. Manually checking each platform is time-consuming and inefficient.

**BUY BOX** solves this problem by automatically detecting cart additions on shopping sites and retrieving comparable products, providing an intelligent recommendation for the best purchase option in a compact floating popup.

---

## Objectives

1. Implement a text-based Information Retrieval system using TF-IDF and Cosine Similarity
2. Build a product comparison engine that evaluates products on multiple attributes
3. Demonstrate the complete IR pipeline: Query Processing → Vectorization → Similarity → Retrieval → Ranking
4. Create a modern Chrome Extension with a compact floating comparison popup

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

**TF (Term Frequency):** How often a word appears in a document.

```
TF(t, d) = (count of t in d) / (total terms in d)
```

**IDF (Inverse Document Frequency):** How rare a word is across all documents.

```
IDF(t) = log((N + 1) / (df + 1)) + 1
```

**TF-IDF:** Words that are frequent in a document but rare across all documents get higher weights.

```
TF-IDF(t, d) = TF(t, d) × IDF(t)
```

### Cosine Similarity

Measures the cosine of the angle between the query vector and each document vector:

```
Cosine Similarity(Q, D) = (Q · D) / (||Q|| × ||D||)
```

- Result: 0 (no similarity) to 1 (identical)
- Products are ranked by relevance score

### Ranking

After retrieval, products are sorted and badged:

- **BEST MATCH** — Highest cosine similarity (relevance first, then price, rating, reviews as tiebreakers)
- **LOWEST PRICE** — Product with the minimum price
- **HIGHEST RATED** — Product with the best rating (review count as tiebreaker)

**Retrieval and Ranking are separate:**
- **Retrieval** = VSM + TF-IDF + Cosine Similarity
- **Ranking** = Sort by price, rating, reviews, purchases + badge assignment

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│             Chrome Extension (Manifest V3)            │
│                                                       │
│  Content Script (shopping sites)                      │
│    ↓ detects "Add to Cart" click                      │
│    ↓ reads product title                              │
│    ↓ sends to background                              │
│                                                       │
│  Background Service Worker                            │
│    ↓ stores title in chrome.storage                   │
│    ↓ opens BUY BOX popup                              │
│                                                       │
│  BUY BOX Popup (React + Vite)                         │
│    ↓ reads detected title                             │
│    ↓ user clicks "Compare Now"                        │
│    ↓ IR Pipeline:                                     │
│      Preprocessing → TF-IDF → Cosine Similarity       │
│    ↓ Top-K results with ranking badges                │
│    ↓ Sortable comparison table                        │
│                                                       │
│  Data Sources:                                        │
│    • eBay API (via serverless proxy, optional)        │
│    • Local JSON dataset (86 products, always available)│
└──────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer          | Technology                       |
| -------------- | -------------------------------- |
| Extension      | Chrome Manifest V3               |
| Frontend       | React 19, Vite 8                 |
| Styling        | Vanilla CSS (glassmorphism, dark) |
| IR Engine      | Pure JavaScript (TF-IDF, Cosine) |
| Dataset        | JSON (86 products)               |

---

## Project Structure

```
buy-box/
├── src/
│   ├── ir/                        # Information Retrieval engine
│   │   ├── stopwords.js           #   English stop words set
│   │   ├── preprocessing.js       #   Porter Stemmer + tokenizer
│   │   ├── tfidf.js               #   TF-IDF Vectorizer
│   │   ├── similarity.js          #   Cosine similarity
│   │   └── retrieval.js           #   Pipeline orchestrator
│   ├── services/                  # Data sources & ranking
│   │   ├── ranking.js             #   Sort + badge assignment
│   │   ├── ebayApi.js             #   eBay API client
│   │   ├── normalizeProduct.js    #   Schema normalizer
│   │   └── fallbackData.js        #   Offline dataset loader
│   ├── components/                # React UI components
│   │   ├── Header.jsx
│   │   ├── DetectedItem.jsx
│   │   ├── SearchBar.jsx
│   │   ├── ResultsTable.jsx
│   │   └── PipelineExplainer.jsx
│   ├── content/
│   │   └── content.js             # Cart detection content script
│   ├── background/
│   │   └── background.js          # Service worker
│   ├── data/
│   │   └── products.json          # 86-product dataset
│   ├── App.jsx                    # Main application
│   ├── main.jsx                   # Entry point
│   └── index.css                  # Design system
├── public/
│   ├── manifest.json              # Chrome Manifest V3
│   ├── favicon.svg
│   └── icons.svg
├── sidepanel.html                 # BUY BOX popup HTML entry
├── package.json
├── vite.config.js
├── .gitignore
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Node.js 16+
- npm (Node.js package manager)
- Google Chrome

### Build & Install

```bash
# Install dependencies
npm install

# Build the extension
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `dist/` folder

### Optional: eBay API

To enable live eBay product data, set the proxy URL before building:

```bash
# Set your serverless proxy endpoint
# (handles OAuth2 — no secrets in extension source)
VITE_EBAY_PROXY_URL=https://your-proxy.example.com npm run build
```

When no proxy is configured, the extension uses the offline dataset (86 products across 7 categories).

---

## User Flow

1. **Browse** any supported shopping site (Amazon, Flipkart, eBay, etc.)
2. **Add to Cart** — the extension automatically detects the cart event
3. **BUY BOX opens** near the top-right with the detected product title
4. **Compare Now** — triggers the IR pipeline
5. **View** ranked results with relevance scores, prices, and ratings
6. **Sort** by Best Match, Lowest Price, Highest Rating, Most Reviews, or Most Purchased
7. **Open** a direct buying link for the preferred offer

---

## Example Queries

| Query                     | Expected Results               |
| ------------------------- | ------------------------------ |
| Nike Running Shoes        | Nike shoes across 4 platforms  |
| Samsung Galaxy Phone      | Samsung phones from 2 platforms|
| Sony Headphones           | Sony headphones from 3 platforms|
| Maybelline Foundation     | Maybelline products from 4 platforms|
| Maggi Noodles             | Maggi packs from 4 platforms   |

---

## License

This project is created for academic purposes as a final-year Information Retrieval project.
