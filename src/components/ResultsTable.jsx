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
export default function ResultsTable({ results, noMatchMessage, missingPlatforms = [], sortBy, onSortChange }) {
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
          <span className="source-label">BUY BOX comparison</span>
          <h2>Same product across platforms</h2>
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

      <div className="comparison-group">
        <div className="platform-list">
          {results.map((product, index) => (
            <article className="product-card" key={`${product.platform}-${product.product_name}-${index}`}>
              {product.image !== 'N/A' && <img className="product-image" src={product.image} alt="" />}
              <div className="product-card__body">
                <div className="product-card__topline">
                  <span className="platform-name">{product.platform}</span>
                  {product.badges?.map(badge => <span key={badge} className={badgeClass(badge)}>{badge}</span>)}
                </div>
                <h3>{product.product_name}</h3>
                <div className="product-facts">
                  <strong>{formatValue(product.price, '₹')}</strong>
                  <span>Rating {formatValue(product.rating)}</span>
                  <span>{formatValue(product.review_count)} reviews</span>
                  <span>{formatValue(product.availability)}</span>
                </div>
                {product.product_url && product.product_url !== 'N/A' ? <a className="buy-link" href={product.product_url} target="_blank" rel="noreferrer">View deal</a> : <span className="cell-na">Link unavailable</span>}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
