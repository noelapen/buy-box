# BUY BOX — Smart Shopping Comparison Chrome Extension

> **Compare Smart. Shop Better.**

A Chrome Extension powered by Information Retrieval that compares products across multiple Indian e-commerce platforms using **TF-IDF + Cosine Similarity**, with real-time data fetching from Google Shopping, Amazon, and Flipkart — ranked with a weighted scoring system.

---

## Problem Statement

Online shoppers face the challenge of comparing the same product across multiple e-commerce platforms (Amazon, Flipkart, Myntra, etc.) to find the best deal. Manually checking each platform is time-consuming and inefficient.

**BUY BOX** solves this problem by automatically detecting cart additions on shopping sites and retrieving comparable products, providing an intelligent recommendation for the best purchase option in a compact floating popup.

---

## Objectives

1. Implement a text-based Information Retrieval system using TF-IDF and Cosine Similarity
2. Build a product comparison engine that evaluates products on multiple attributes
3. Demonstrate the complete IR pipeline: Query Processing → Vectorization → Similarity → Retrieval → Ranking
4. Integrate real-time data from Indian e-commerce platforms via APIs
5. Create a modern Chrome Extension with a compact floating comparison popup

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

```
┌──────────────────────────────────────────────────────┐
│             Chrome Extension (Manifest V3)            │
│                                                       │
│  Content Script (shopping sites)                      │
│    ↓ detects "Add to Cart" click                      │
│    ↓ reads product title → opens BUY BOX popup        │
│                                                       │
│  BUY BOX Popup (React + Vite)                         │
│    ↓ reads detected title                             │
│    ↓ user clicks "Compare Now"                        │
│    ↓ Real-Time Data Fetching:                         │
│      ├─ Google Shopping (SerpAPI)                     │
│      ├─ Amazon India (PA-API 5.0)                     │
│      ├─ Flipkart (Affiliate API)                      │
│      └─ Offline dataset (86 products, fallback)       │
│    ↓ IR Pipeline:                                     │
│      Preprocessing → TF-IDF → Cosine Similarity       │
│    ↓ Top-K results with ranking badges                │
│    ↓ Sortable comparison cards                        │
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
| Live Data      | SerpAPI, Amazon PA-API, Flipkart |
| Fallback       | JSON (86 products)               |

---

## Project Structure

```
buy-box/
├── src/
│   ├── ir/                        # Information Retrieval engine
│   │   ├── stopwords.js           #   Stop words set
│   │   ├── preprocessing.js       #   Porter Stemmer + tokenizer
│   │   ├── tfidf.js               #   TF-IDF Vectorizer
│   │   ├── similarity.js          #   Cosine similarity
│   │   ├── productIdentity.js     #   Brand/category extraction
│   │   └── retrieval.js           #   Pipeline orchestrator
│   ├── services/
│   │   ├── liveSearch.js          #   All platform APIs + aggregator
│   │   ├── normalizeProduct.js    #   Schema normalizer (all sources)
│   │   ├── ranking.js             #   Sort + badge assignment
│   │   └── fallbackData.js        #   Offline dataset loader
│   ├── components/
│   │   ├── Header.jsx
│   │   ├── DetectedItem.jsx
│   │   ├── SearchBar.jsx
│   │   ├── ResultsTable.jsx
│   │   ├── SourceIndicator.jsx    #   Live data source badges
│   │   └── PipelineExplainer.jsx
│   ├── content/
│   │   ├── content.js             #   Cart detection content script
│   │   └── cartDetection.js       #   Platform-specific selectors
│   ├── background/
│   │   └── background.js          #   Service worker
│   ├── data/
│   │   └── products.json          #   86-product fallback dataset
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── public/
│   ├── manifest.json
│   ├── favicon.svg
│   └── icons.svg
├── sidepanel.html
├── package.json
├── vite.config.js
└── README.md
```

---

## Setup Instructions

### Prerequisites

- Node.js 16+
- npm
- Google Chrome

### Build & Install

```bash
npm install
npm run build
```

### Load in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist/` folder

### Environment Variables (optional)

Create a `.env` file to enable real-time data sources:

```env
# Google Shopping via SerpAPI
VITE_SERPAPI_KEY=your_serpapi_key

# Amazon India PA-API 5.0
VITE_AMAZON_ACCESS_KEY=your_access_key
VITE_AMAZON_SECRET_KEY=your_secret_key
VITE_AMAZON_PARTNER_TAG=your_tag-21

# Flipkart Affiliate API
VITE_FLIPKART_AFFILIATE_ID=your_id
VITE_FLIPKART_TOKEN=your_token
```

All API keys are optional. Without any keys, the extension uses the offline dataset (86 products across 7 categories).

---

## Data Sources

| Source | Coverage | Requires |
|--------|----------|----------|
| SerpAPI (Google Shopping) | All platforms indexed by Google | API key |
| Amazon PA-API 5.0 | Amazon India | Associate account + API keys |
| Flipkart Affiliate API | Flipkart | Affiliate account + token |
| Offline Dataset | 86 products, 7 categories | Nothing (always available) |

---

## User Flow

1. **Browse** any supported shopping site (Amazon, Flipkart, Myntra, etc.)
2. **Add to Cart** — the extension automatically detects the cart event
3. **BUY BOX opens** near the top-right with the detected product title
4. **Compare Now** — triggers the IR pipeline with real-time data
5. **View** ranked results with relevance scores, prices, and ratings
6. **Sort** by Best Match, Lowest Price, Highest Rating, Most Reviews, or Most Purchased
7. **Open** a direct buying link for the preferred offer

---

## Example Queries

| Query                     | Expected Results               |
| ------------------------- | ------------------------------ |
| Nike Running Shoes        | Nike shoes across platforms    |
| Samsung Galaxy Phone      | Samsung phones from platforms  |
| Sony Headphones           | Sony headphones from platforms |
| Maybelline Foundation     | Maybelline products from platforms |
| Maggi Noodles             | Maggi packs from platforms     |

---

## License

This project is created for academic purposes as a final-year Information Retrieval project.
