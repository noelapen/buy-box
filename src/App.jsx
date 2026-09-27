import React, { useEffect, useState } from 'react';
import { retrieveProducts } from './ir/retrieval.js';
import { SORT_OPTIONS, sortProducts } from './services/ranking.js';

import Header from './components/Header.jsx';
import DetectedItem from './components/DetectedItem.jsx';
import SearchBar from './components/SearchBar.jsx';
import ResultsTable from './components/ResultsTable.jsx';
import SourceIndicator from './components/SourceIndicator.jsx';

/* Main app — orchestrates detection → search → comparison */
export default function App() {
  const [query, setQuery] = useState('');
  const [detectedTitle, setDetectedTitle] = useState('');
  const [results, setResults] = useState([]);
  const [retrieval, setRetrieval] = useState(null);
  const [sortBy, setSortBy] = useState(SORT_OPTIONS.BEST_MATCH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [minimized, setMinimized] = useState(false);

  // On mount, check chrome.storage for a detected cart item
  useEffect(() => {
    function applyDetectedItem(buyBoxCartItem) {
      if (buyBoxCartItem) {
        setDetectedTitle(buyBoxCartItem);
        setQuery(buyBoxCartItem);
        setMinimized(false);
        compare(buyBoxCartItem);
      }
    }

    chrome.storage?.local.get('buyBoxCartItem').then(({ buyBoxCartItem }) => {
      applyDetectedItem(buyBoxCartItem);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.buyBoxCartItem?.newValue) {
        applyDetectedItem(changes.buyBoxCartItem.newValue);
      }
    };

    const handlePopupQuery = event => {
      if (event.data?.type === 'BUY_BOX_QUERY') applyDetectedItem(event.data.query);
    };

    chrome.storage?.onChanged?.addListener(handleStorageChange);
    window.addEventListener('message', handlePopupQuery);
    return () => {
      chrome.storage?.onChanged?.removeListener(handleStorageChange);
      window.removeEventListener('message', handlePopupQuery);
    };
  }, []);

  /* Run the IR comparison pipeline */
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

  function handleSortChange(nextSort) {
    setSortBy(nextSort);
    setResults(sortProducts(results, nextSort));
  }

  function useDetectedTitle() {
    if (detectedTitle) { setQuery(detectedTitle); compare(detectedTitle); }
  }

  function postPopupAction(type) {
    window.parent?.postMessage({ type }, '*');
  }

  return (
    <main className="app-shell">
      <Header
        onMinimize={() => { setMinimized(v => !v); postPopupAction('BUY_BOX_MINIMIZE'); }}
        onClose={() => postPopupAction('BUY_BOX_CLOSE')}
      />

      {!minimized && <>
        <DetectedItem title={detectedTitle} onUse={useDetectedTitle} />

        <SearchBar
          query={query}
          onQueryChange={setQuery}
          onSubmit={compare}
          loading={loading}
        />

        {error && <p className="error-message">{error}</p>}

        {retrieval && <>
          <SourceIndicator sources={retrieval.sources} />
          <ResultsTable
            results={results}
            noMatchMessage={retrieval.noMatchMessage}
            missingPlatforms={retrieval.missingPlatforms}
            sortBy={sortBy}
            onSortChange={handleSortChange}
          />
        </>}
      </>}
    </main>
  );
}
