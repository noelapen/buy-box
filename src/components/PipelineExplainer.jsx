import React from 'react';

/**
 * PipelineExplainer — Collapsible panel showing the IR retrieval pipeline steps.
 * Helps users understand how results were computed (TF-IDF, cosine similarity, etc.).
 *
 * @param {Object} props
 * @param {string[]|null} props.pipeline - Array of pipeline step descriptions
 * @param {boolean} props.hasResults - Whether a comparison has been run
 */
export default function PipelineExplainer({ pipeline, hasResults }) {
  return (
    <details className="explanation">
      <summary>How Results Were Retrieved</summary>

      <div className="pipeline">
        {pipeline && pipeline.length > 0 ? (
          pipeline.map((step, index) => (
            <span className="pipeline-step" key={step}>
              <b className="pipeline-number">{index + 1}</b>
              {step}
            </span>
          ))
        ) : (
          <span className="pipeline-step">
            Run a comparison to inspect the retrieval pipeline.
          </span>
        )}
      </div>

      {hasResults && (
        <p className="note">
          Each row shows its computed cosine similarity between the processed query
          and the product document. No score, price, rating, ranking, or recommendation
          is hardcoded.
        </p>
      )}
    </details>
  );
}
