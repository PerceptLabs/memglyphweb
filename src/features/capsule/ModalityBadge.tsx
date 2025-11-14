/**
 * Modality Badge Component
 *
 * Displays the current GlyphCase modality (Static or Dynamic)
 * and provides access to envelope operations in Dynamic mode.
 */

import { useState } from 'preact/hooks';
import type { Modality, EnvelopeStats } from '../../db/envelope.manager';
import './ModalityBadge.css';

export interface ModalityBadgeProps {
  modality: Modality;
  envelopeStats?: EnvelopeStats | null;
  envelopeExtracted?: boolean;
  onEnableDynamic?: () => Promise<void>;
  onSaveGlyphCase?: () => Promise<void>;
  onClearEnvelope?: () => Promise<void>;
  onVerifyEnvelope?: () => Promise<void>;
}

export function ModalityBadge({
  modality,
  envelopeStats,
  envelopeExtracted,
  onEnableDynamic,
  onSaveGlyphCase,
  onClearEnvelope,
  onVerifyEnvelope
}: ModalityBadgeProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleEnableDynamic = async () => {
    if (!onEnableDynamic) return;
    setLoading(true);
    try {
      await onEnableDynamic();
    } catch (err) {
      console.error('Failed to enable dynamic mode:', err);
      alert(`Failed to enable dynamic mode: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!onSaveGlyphCase) return;
    setLoading(true);
    try {
      await onSaveGlyphCase();
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to save GlyphCase:', err);
      alert(`Failed to save GlyphCase: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!onClearEnvelope) return;

    const confirmed = confirm(
      'Are you sure you want to clear all envelope data?\n\n' +
      'This will delete:\n' +
      `• ${envelopeStats?.retrievalCount || 0} retrieval logs\n` +
      `• ${envelopeStats?.feedbackCount || 0} feedback entries\n` +
      `• ${envelopeStats?.embeddingCount || 0} contextual embeddings\n` +
      `• ${envelopeStats?.summaryCount || 0} context summaries\n\n` +
      'This action cannot be undone.'
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      await onClearEnvelope();
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to clear envelope:', err);
      alert(`Failed to clear envelope: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!onVerifyEnvelope) return;
    setLoading(true);
    try {
      await onVerifyEnvelope();
      setShowMenu(false);
    } catch (err) {
      console.error('Failed to verify envelope:', err);
      alert(`Failed to verify envelope: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const isDynamic = modality === 'dynamic';

  return (
    <div className="modality-badge">
      <button
        className={`modality-badge-button ${modality}`}
        onClick={() => setShowMenu(!showMenu)}
        title={isDynamic ? 'Dynamic GlyphCase - Click for options' : 'Static GlyphCase - Click for options'}
      >
        {isDynamic ? '🧠 Dynamic' : '📦 Static'}
      </button>

      {showMenu && (
        <div className="modality-menu">
          <div className="modality-menu-header">
            <h3>{isDynamic ? 'Dynamic Mode' : 'Static Mode'}</h3>
            <button
              className="modality-menu-close"
              onClick={() => setShowMenu(false)}
            >
              ×
            </button>
          </div>

          {!isDynamic ? (
            <div className="modality-menu-content">
              <p className="modality-description">
                This GlyphCase is in static mode. All data is read-only.
              </p>

              <div className="modality-info">
                <h4>Enable Dynamic Mode to:</h4>
                <ul>
                  <li>Log search queries and results</li>
                  <li>Provide feedback on retrievals</li>
                  <li>Generate contextual summaries</li>
                  <li>Build adaptive memory over time</li>
                </ul>
              </div>

              <button
                className="btn-primary"
                onClick={handleEnableDynamic}
                disabled={loading}
              >
                {loading ? 'Enabling...' : 'Enable Dynamic Mode'}
              </button>
            </div>
          ) : (
            <div className="modality-menu-content">
              <p className="modality-description">
                This GlyphCase has an active Envelope for episodic memory.
              </p>

              {envelopeExtracted && (
                <p className="envelope-hint" style={{ marginBottom: '1rem', fontSize: '0.9em', color: '#6b7280' }}>
                  ℹ️ Opened from canonical .gcase+ format (Core + Envelope in single file)
                </p>
              )}

              {envelopeStats && (
                <div className="envelope-stats">
                  <h4>Envelope Statistics:</h4>
                  <div className="envelope-stats-grid">
                    <div className="envelope-stat">
                      <span className="envelope-stat-label">Retrievals</span>
                      <span className="envelope-stat-value">{envelopeStats.retrievalCount}</span>
                    </div>
                    <div className="envelope-stat">
                      <span className="envelope-stat-label">Feedbacks</span>
                      <span className="envelope-stat-value">{envelopeStats.feedbackCount}</span>
                    </div>
                    <div className="envelope-stat">
                      <span className="envelope-stat-label">Embeddings</span>
                      <span className="envelope-stat-value">{envelopeStats.embeddingCount}</span>
                    </div>
                    <div className="envelope-stat">
                      <span className="envelope-stat-label">Summaries</span>
                      <span className="envelope-stat-value">{envelopeStats.summaryCount}</span>
                    </div>
                  </div>

                  {envelopeStats.firstActivity && (
                    <p className="envelope-activity">
                      <strong>Active since:</strong>{' '}
                      {new Date(envelopeStats.firstActivity).toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              <div className="envelope-actions">
                <button
                  className="btn-secondary btn-sm"
                  onClick={handleVerify}
                  disabled={loading}
                >
                  {loading ? 'Verifying...' : '✓ Verify Integrity'}
                </button>

                <button
                  className="btn-secondary btn-sm"
                  onClick={handleSave}
                  disabled={loading}
                >
                  {loading ? 'Saving...' : '💾 Save GlyphCase'}
                </button>

                <button
                  className="btn-danger btn-sm"
                  onClick={handleClear}
                  disabled={loading}
                >
                  {loading ? 'Clearing...' : '🗑️ Clear Envelope'}
                </button>
              </div>

              <p className="envelope-hint">
                💡 Save GlyphCase creates a single .gcase+ file with Core + Envelope merged together.
              </p>
            </div>
          )}
        </div>
      )}

      {showMenu && (
        <div
          className="modality-menu-backdrop"
          onClick={() => setShowMenu(false)}
        />
      )}
    </div>
  );
}
