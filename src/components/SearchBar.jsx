import React from 'react';

/**
 * SearchBar — Product search form with input and "Compare Now" button.
 *
 * @param {Object} props
 * @param {string} props.query - Current search query
 * @param {Function} props.onQueryChange - Called when input changes
 * @param {Function} props.onSubmit - Called when form is submitted
 * @param {boolean} props.loading - Whether a comparison is in progress
 */
export default function SearchBar({ query, onQueryChange, onSubmit, loading }) {
  function handleSubmit(event) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="query-form" onSubmit={handleSubmit}>
      <label htmlFor="search-query">Search product</label>
      <div className="query-row">
        <input
          id="search-query"
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Enter a product to compare"
          autoComplete="off"
        />
        <button type="submit" disabled={loading || !query.trim()}>
          {loading ? (
            <>
              <span className="btn-spinner" />
              Working…
            </>
          ) : (
            'Compare Now'
          )}
        </button>
      </div>
    </form>
  );
}
