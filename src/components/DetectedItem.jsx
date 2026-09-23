import React from 'react';

/**
 * DetectedItem — Shows the product title detected by the content script.
 * Includes a button to copy it into the search input.
 *
 * @param {Object} props
 * @param {string} props.title - Detected product title
 * @param {Function} props.onUse - Callback when user wants to use the detected title
 */
export default function DetectedItem({ title, onUse }) {
  return (
    <section className="detected-panel glass-panel">
      <div>
        <span className="label">Detected Cart Item</span>
        {title ? (
          <strong>{title}</strong>
        ) : (
          <strong className="no-item">No cart event yet</strong>
        )}
      </div>
      <button
        className="icon-button"
        title="Use detected title"
        onClick={onUse}
        disabled={!title}
        aria-label="Use detected product title as search query"
      >
        ↗
      </button>
    </section>
  );
}
