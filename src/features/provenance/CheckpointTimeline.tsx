/**
 * Checkpoint Timeline Component
 *
 * Displays checkpoint history with merkle roots and metadata.
 */

import type { Checkpoint } from '../../db/types';

export interface CheckpointItemProps {
  checkpoint: Checkpoint;
  isLatest?: boolean;
}

export function CheckpointItem({ checkpoint, isLatest }: CheckpointItemProps) {
  return (
    <div className={`checkpoint-item ${isLatest ? 'checkpoint-latest' : ''}`}>
      <div className="checkpoint-header">
        <div className="checkpoint-epoch">
          {isLatest && <span className="checkpoint-badge">Latest</span>}
          <span className="checkpoint-epoch-value">Epoch {checkpoint.epoch}</span>
        </div>
        <div className="checkpoint-date">
          {new Date(checkpoint.createdTs).toLocaleString()}
        </div>
      </div>

      <div className="checkpoint-body">
        <div className="checkpoint-field">
          <span className="field-label">Merkle Root:</span>
          <code className="field-value" title={checkpoint.merkleRoot}>
            {checkpoint.merkleRoot.substring(0, 16)}...
          </code>
        </div>

        <div className="checkpoint-field">
          <span className="field-label">Pages:</span>
          <span className="field-value">{checkpoint.pagesCount}</span>
        </div>

        {checkpoint.anchors && checkpoint.anchors.length > 0 && (
          <div className="checkpoint-field">
            <span className="field-label">Anchors:</span>
            <span className="field-value">{checkpoint.anchors.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export interface CheckpointTimelineProps {
  checkpoints: Checkpoint[];
  loading?: boolean;
  error?: string | null;
}

export function CheckpointTimeline({ checkpoints, loading, error }: CheckpointTimelineProps) {
  if (loading) {
    return (
      <div className="checkpoint-timeline-loading">
        <div className="spinner"></div>
        <p>Loading checkpoints...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="checkpoint-timeline-error">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (checkpoints.length === 0) {
    return (
      <div className="checkpoint-timeline-empty">
        <p>No checkpoints found</p>
        <p className="hint">This capsule has not been checkpointed yet</p>
      </div>
    );
  }

  return (
    <div className="checkpoint-timeline">
      {checkpoints.map((checkpoint, index) => (
        <CheckpointItem
          key={checkpoint.epoch}
          checkpoint={checkpoint}
          isLatest={index === 0}
        />
      ))}
    </div>
  );
}
