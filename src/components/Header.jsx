import React from 'react';

/**
 * Header — Top masthead with logo, eyebrow label, and animated status dot.
 */
export default function Header({ onMinimize, onClose }) {
  return (
    <>
      <header className="masthead">
        <div>
          <span className="eyebrow">Smart price comparison</span>
          <h1>BUY BOX</h1>
        </div>
        <div className="header-actions">
          <span className="status-dot" title="BUY BOX is ready" />
          <button className="window-button" type="button" onClick={onMinimize} aria-label="Minimize BUY BOX" title="Minimize">-</button>
          <button className="window-button" type="button" onClick={onClose} aria-label="Close BUY BOX" title="Close">x</button>
        </div>
      </header>
    </>
  );
}
