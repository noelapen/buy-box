# BUY BOX - Product Price Comparator

BuyBox is a Flask-based product comparison app that searches for relevant products, ranks them using a text IR pipeline, and compares price, rating, review count, and platform details. The current workflow is:

1. User enters a product or category query.
2. The app reformulates the query and extracts brand/category intent.
3. The app searches ShopIt first.
4. If ShopIt is unavailable or returns no usable products, the app searches the bundled local dataset.
5. TF-IDF and cosine similarity rank candidates, which are sorted by the selected option.

This README reflects the current project workflow and the exact steps to run it locally.

---

## Current Project Workflow

The backend logic lives in `app.py` and follows this flow:

```
User query
  ↓
Query reformulation (lowercase, tokenization, stop-word removal, stemming)
  ↓
Brand/category extraction
  ↓
Live ShopIt search
↓
Local products.json fallback if needed
  ↓
Candidate filtering and TF-IDF scoring
  ↓
Cosine similarity ranking
  ↓
Final sorting + result display
```

### What happens at runtime

- `query_reformulation.py` cleans and normalizes the user query.
- `tfidf_engine.py` computes TF-IDF vectors and cosine similarity scores.
- `app.py` loads environment config from `.env` if available.
- Every search request calls ShopIt at `SHOPIT_API_URL/api/search?q=...&source=all` first.
- If ShopIt returns products, BuyBox ranks and displays those results. If it is unavailable or returns no usable products, BuyBox ranks and displays products from `products.json`.
- If no candidate has a positive similarity score for the query, BuyBox shows a no-matching-products message instead of unrelated products.
- The server prints the IR trace in the terminal, including reformulated queries and cosine scores.

---

## Project Structure

```text
Buy Box/
├── app.py
├── query_reformulation.py
├── tfidf_engine.py
├── products.json
├── .env
├── static/
├── templates/
├── ShopIt/               # optional local ShopIt backend
├── .gitignore
├── README.md
└── __pycache__/
```

---

## Prerequisites

- Python 3.9+
- Flask
- Optional: local ShopIt API running on `http://127.0.0.1:8000`

---

## How to Run the Project

### 1) Open a terminal in the project root

```bash
cd "C:\Users\Dell\Downloads\projects\info ret\Buy Box"
```

### 2) Create and activate a virtual environment

Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

Linux/macOS:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

### 3) Install the dependencies

```bash
python -m pip install --upgrade pip
python -m pip install flask
```

### 4) Configure the API URL (optional but recommended)

The project automatically loads settings from the `.env` file in the root directory. The current default is:

```env
SHOPIT_API_URL=http://127.0.0.1:8000
SHOPIT_API_KEY=
```

If you want to override it in PowerShell before starting the app:

```powershell
$env:SHOPIT_API_URL = "http://127.0.0.1:8000"
```

### 5) Start the ShopIt backend (optional but preferred)

If you want live product results, run the ShopIt API in a separate terminal. This project expects the backend at:

```text
http://127.0.0.1:8000/api/search?q=...&source=all
```

If the local ShopIt project is in the sibling `ShopIt/` folder, start it from there according to that repository's instructions. If ShopIt is unavailable, BuyBox will automatically use the fallback dataset in `products.json`.

### 6) Start the BuyBox app

```bash
python app.py
```

Then open:

```text
http://127.0.0.1:5000
```

---

## Typical User Flow

1. Enter a query such as `cup`, `kurti`, `shoes`, or `Nike Revolution 6`.
2. The app reformulates the query and extracts product identity.
3. The app searches ShopIt first and displays live results when available.
4. If ShopIt cannot provide usable results, the app displays matches from the local catalog.
5. The results are ranked by best match and sorted by the chosen option.
6. The terminal prints the IR trace (`raw query`, `processed query`, `TF-IDF vectors`, `cosine scores`, results).

---

## Supported Sorting Options

The app supports these sort modes:

- Best Match
- Lowest Price
- Highest Rating
- Most Reviews
- Most Purchased

---

## Retrieval Metrics

Each search displays Precision, Recall, F1, P@K, MAP, and average search response time. Relevance is estimated using the existing pseudo-relevance method: the top three candidates in the initial ranking are treated as relevant. These are estimates, not ground-truth evaluation results.

Precision, Recall, F1, and P@K are calculated from the best-match retrieval ranking before optional price/rating sorting. MAP is the mean of average precision across unique normalized queries seen since the app started. Average search response time is measured with a monotonic timer and calculated as total search-pipeline time divided by completed search requests; it excludes HTML rendering and resets when the app process restarts.

## Example Search Queries

```text
cup
kurti
shoes
Nike Revolution 6
```

Expected behavior:

- Category searches return relevant product listings.
- Brand/model searches narrow to similar product names and matching brand identities.
- If the live source fails, results still appear from the local dataset.

---

## Troubleshooting

### App does not start

Check that Flask is installed:

```bash
python -m pip install flask
```

### Port 5000 is already in use

Stop the other process or run the app on a different port manually:

```bash
python -c "from app import app; app.run(port=5001, debug=True)"
```

### ShopIt is not returning results

This is expected in development if the live backend is down. BuyBox will automatically fallback to `products.json` and continue working.

### No result is displayed

- Confirm the app started successfully.
- Check the terminal logs for query reformulation output.
- Make sure the project is opened in the root folder and not from a child folder.

---

## License

This project is created for academic purposes as a final-year Information Retrieval project.
