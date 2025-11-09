/**
 * Provenance Panel Component
 *
 * Combined panel for checkpoints and verification.
 */

import { useState } from 'preact/hooks';
import { CheckpointTimeline } from './CheckpointTimeline';
import { VerificationPanel } from './VerificationPanel';
import type { Checkpoint, VerificationResult } from '../../db/types';

type ProvenanceTab = 'checkpoints' | 'verification';

export interface ProvenancePanelProps {
  checkpoints: Checkpoint[];
  verificationResult: VerificationResult | null;
  loading?: boolean;
  verifying?: boolean;
  error?: string | null;
  onVerify?: () => void;
}

export function ProvenancePanel({
  checkpoints,
  verificationResult,
  loading,
  verifying,
  error,
  onVerify,
}: ProvenancePanelProps) {
  const [activeTab, setActiveTab] = useState<ProvenanceTab>('checkpoints');

  return (
    <div className="provenance-panel">
      <div className="provenance-header">
        <h3>Provenance & Trust</h3>
      </div>

      {/* Tabs */}
      <div className="provenance-tabs">
        <button
          className={`provenance-tab ${activeTab === 'checkpoints' ? 'active' : ''}`}
          onClick={() => setActiveTab('checkpoints')}
        >
          📜 Checkpoints ({checkpoints.length})
        </button>
        <button
          className={`provenance-tab ${activeTab === 'verification' ? 'active' : ''}`}
          onClick={() => setActiveTab('verification')}
        >
          🔐 Verification
        </button>
      </div>

      {/* Tab Content */}
      <div className="provenance-content">
        {activeTab === 'checkpoints' && (
          <CheckpointTimeline checkpoints={checkpoints} loading={loading} error={error} />
        )}

        {activeTab === 'verification' && (
          <VerificationPanel result={verificationResult} verifying={verifying} onVerify={onVerify} />
        )}
      </div>
    </div>
  );
}
