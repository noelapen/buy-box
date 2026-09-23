import React from 'react';

/**
 * Header — Top masthead with logo, eyebrow label, and animated status dot.
 */
export default function Header() {
  return (
    <>
      <header className="masthead">
        <div>
          <span className="eyebrow">IR Shopping Intelligence</span>
          <h1>BLACK BOX</h1>
        </div>
        <span className="status-dot" title="Extension ready" />
      </header>
      <p className="tagline">Compare Smart. Shop Better.</p>
    </>
  );
}
