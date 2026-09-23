import React from 'react';
import { SORT_OPTIONS } from '../services/ranking.js';

/**
 * Format a value for display, showing 'N/A' for missing data.
 * Never invents values — shows exactly what the data contains.
 */
function formatValue(value, prefix = '') {
  if (value === 'N/A' || value === undefined || value === null) return 'N/A';
  return `${prefix}${value}`;
}

/**
 * Map badge text to CSS class for color coding.
 */
function badgeClass(badge) {
  const lower = badge.toLowerCase();
  if (lower.includes('best')) return 'badge badge--best';
  if (lower.includes('price')) return 'badge badge--price';
  if (lower.includes('rated') || lower.includes('rating')) return 'badge badge--rating';
  return 'badge';
}

/**
 * ResultsTable — Sortable comparison table with ranked product results.
 *
 * @param {Object} props
 * @param {Object[]} props.results - Array of ranked product objects
 * @param {string} props.source - Data source label (e.g. "Offline fallback dataset")
 * @param {string} props.sortBy - Current sort option key
 * @param {Function} props.onSortChange - Called with new sort option value
 */
export default function ResultsTable({ results, source, noMatchMessage, missingPlatforms = [], sortBy, onSortChange }) {
  if (!results || results.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-icon">-</div>
        <p>{noMatchMessage || 'No eligible same-brand matches found.'}</p>
      </div>
    );
  }

  return (
    <section className="results-section">
      {/* Section header with source label + sort dropdown */}
      <div className="section-heading">
        <div>
          <span className="source-label">{source}</span>
          <h2>Comparison Results</h2>
        </div>
        <select
          className="sort-select"
          aria-label="Sort results"
          value={sortBy}
          onChange={(e) => onSortChange(e.target.value)}
        >
          <option value={SORT_OPTIONS.BEST_MATCH}>Best Match</option>
          <option value={SORT_OPTIONS.LOWEST_PRICE}>Lowest Price</option>
          <option value={SORT_OPTIONS.HIGHEST_RATING}>Highest Rating</option>
          <option value={SORT_OPTIONS.MOST_REVIEWS}>Most Reviews</option>
          <option value={SORT_OPTIONS.MOST_PURCHASED}>Most Purchased</option>
        </select>
      </div>

      {missingPlatforms.length > 0 && (
        <p className="match-note">
          Exact same-brand product not found on: {missingPlatforms.join(', ')}
        </p>
      )}

      {/* Scrollable results table */}
      <div className="table-wrap">
        <table className="results-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Product</th>
              <th>Platform</th>
              <th>Price</th>
              <th>Rating</th>
              <th>Reviews</th>
              <th>Purchased</th>
              <th>Relevance</th>
              <th>Link</th>
            </tr>
          </thead>
          <tbody>
            {results.map((product, index) => (
              <tr key={`${product.platform}-${product.product_name}-${index}`}>
                <td className="cell-rank">{index + 1}</td>
                <td className="cell-product">
                  <strong>{product.product_name}</strong>
                  {product.badges && product.badges.length > 0 && (
                    <div className="cell-badges">
                      {product.badges.map((badge) => (
                        <span key={badge} className={badgeClass(badge)}>
                          {badge}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td>{product.platform}</td>
                <td>{formatValue(product.price, '₹')}</td>
                <td>{formatValue(product.rating)}</td>
                <td>{formatValue(product.review_count)}</td>
                <td>{formatValue(product.purchase_count)}</td>
                <td className="cell-score">
                  {typeof product.relevance_score === 'number'
                    ? product.relevance_score.toFixed(4)
                    : 'N/A'}
                </td>
                <td className="cell-link">
                  {product.product_url && product.product_url !== 'N/A' ? (
                    <a href={product.product_url} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : (
                    <span className="cell-na">N/A</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
