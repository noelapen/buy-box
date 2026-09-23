import React, { useEffect, useState } from 'react';
import { retrieveProducts } from './ir/retrieval.js';
import { SORT_OPTIONS, sortProducts } from './services/ranking.js';

import Header from './components/Header.jsx';
import DetectedItem from './components/DetectedItem.jsx';
import SearchBar from './components/SearchBar.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import PipelineExplainer from './components/PipelineExplainer.jsx';

/**
 * App — Main side panel application.
 *
 * Orchestrates the full user flow:
 *   1. On mount, reads detected cart item from chrome.storage.local
 *   2. User types a query or uses the detected title
 *   3. "Compare Now" triggers the IR pipeline (TF-IDF + Cosine Similarity)
 *   4. Results are displayed in a sortable table with ranking badges
 *   5. Pipeline explainer shows how retrieval works
 */
export default function App() {
  const [query, setQuery] = useState('');
  const [detectedTitle, setDetectedTitle] = useState('');
  const [results, setResults] = useState([]);
  const [retrieval, setRetrieval] = useState(null);
  const [sortBy, setSortBy] = useState(SORT_OPTIONS.BEST_MATCH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // On mount, check chrome.storage for a detected cart item
  useEffect(() => {
    function applyDetectedItem(blackBoxCartItem) {
      if (blackBoxCartItem) {
        setDetectedTitle(blackBoxCartItem);
        setQuery(blackBoxCartItem);
        compare(blackBoxCartItem);
      }
    }

    chrome.storage?.local.get('blackBoxCartItem').then(({ blackBoxCartItem }) => {
      applyDetectedItem(blackBoxCartItem);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.blackBoxCartItem?.newValue) {
        applyDetectedItem(changes.blackBoxCartItem.newValue);
      }
    };

    chrome.storage?.onChanged?.addListener(handleStorageChange);
    return () => chrome.storage?.onChanged?.removeListener(handleStorageChange);
  }, []);

  /**
   * Run the IR comparison pipeline.
   * Calls retrieveProducts() which handles:
   *   preprocessing → candidate fetch → TF-IDF → cosine similarity → ranking
   */
  async function compare(nextQuery = query) {
    const cleanQuery = String(nextQuery ?? query ?? '').trim();
    if (!cleanQuery) return;
    setLoading(true);
    setError('');
    try {
      const result = await retrieveProducts(cleanQuery);
      setRetrieval(result);
      setResults(result.results);
      setSortBy(SORT_OPTIONS.BEST_MATCH);
    } catch (compareError) {
      setError(compareError.message || 'Comparison failed.');
    } finally {
      setLoading(false);
    }
  }

  /**
   * Re-sort the current results by a different attribute.
   */
  function handleSortChange(nextSort) {
    setSortBy(nextSort);
    setResults(sortProducts(results, nextSort));
  }

  /**
   * Use the detected cart title as the search query.
   */
  function useDetectedTitle() {
    if (detectedTitle) {
      setQuery(detectedTitle);
      compare(detectedTitle);
    }
  }

  return (
    <main className="app-shell">
      <Header />

      <DetectedItem title={detectedTitle} onUse={useDetectedTitle} />

      <SearchBar
        query={query}
        onQueryChange={setQuery}
        onSubmit={compare}
        loading={loading}
      />

      {error && <p className="error-message">{error}</p>}

      {retrieval && (
        <ResultsTable
          results={results}
          source={retrieval.source}
          noMatchMessage={retrieval.noMatchMessage}
          missingPlatforms={retrieval.missingPlatforms}
          sortBy={sortBy}
          onSortChange={handleSortChange}
        />
      )}

      <PipelineExplainer
        pipeline={retrieval?.pipeline}
        hasResults={!!retrieval}
      />
    </main>
  );
}
