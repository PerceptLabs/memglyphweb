/**
 * Verification Panel Component
 *
 * Displays page verification results with visual status indicators.
 */

import type { VerificationResult } from '../../db/types';

export interface VerificationPanelProps {
  result: VerificationResult | null;
  verifying?: boolean;
  onVerify?: () => void;
}

export function VerificationPanel({ result, verifying, onVerify }: VerificationPanelProps) {
  if (verifying) {
    return (
      <div className="verification-panel verification-loading">
        <div className="spinner"></div>
        <p>Verifying page integrity...</p>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="verification-panel verification-empty">
        <p>Click "Verify Page" to check integrity</p>
        {onVerify && (
          <button className="btn-primary btn-sm" onClick={onVerify}>
            Verify Page
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`verification-panel ${result.verified ? 'verification-success' : 'verification-failure'}`}>
      <div className="verification-header">
        <div className="verification-status">
          {result.verified ? (
            <>
              <span className="status-icon">✓</span>
              <span className="status-text">Verified</span>
            </>
          ) : (
            <>
              <span className="status-icon">✗</span>
              <span className="status-text">Verification Failed</span>
            </>
          )}
        </div>
      </div>

      <div className="verification-body">
        <div className="verification-field">
          <span className="field-label">Content SHA:</span>
          <code className="field-value" title={result.contentSha}>
            {result.contentSha.substring(0, 16)}...
          </code>
        </div>

        {result.expectedSha && (
          <div className="verification-field">
            <span className="field-label">Expected SHA:</span>
            <code className="field-value" title={result.expectedSha}>
              {result.expectedSha.substring(0, 16)}...
            </code>
          </div>
        )}

        {result.epoch && (
          <div className="verification-field">
            <span className="field-label">Checkpoint Epoch:</span>
            <span className="field-value">{result.epoch}</span>
          </div>
        )}

        {result.merkleRoot && (
          <div className="verification-field">
            <span className="field-label">Merkle Root:</span>
            <code className="field-value" title={result.merkleRoot}>
              {result.merkleRoot.substring(0, 16)}...
            </code>
          </div>
        )}

        {result.signer && (
          <div className="verification-field">
            <span className="field-label">Signer:</span>
            <code className="field-value">{result.signer}</code>
          </div>
        )}

        {result.signature && (
          <div className="verification-field">
            <span className="field-label">Signature:</span>
            <code className="field-value" title={result.signature}>
              {result.signature.substring(0, 16)}...
            </code>
          </div>
        )}
      </div>

      {onVerify && (
        <div className="verification-footer">
          <button className="btn-secondary btn-sm" onClick={onVerify}>
            Verify Again
          </button>
        </div>
      )}
    </div>
  );
}
