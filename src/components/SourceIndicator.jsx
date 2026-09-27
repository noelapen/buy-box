import React from 'react';

/* Shows which data sources contributed results */
export default function SourceIndicator({ sources = [] }) {
  if (!sources.length) return null;
  return (
    <div className="source-indicator">
      <span className="source-indicator__label">Sources:</span>
      {sources.map(src => (
        <span key={src} className="source-indicator__badge">{src}</span>
      ))}
    </div>
  );
}
