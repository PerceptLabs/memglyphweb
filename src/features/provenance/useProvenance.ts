/**
 * Provenance Hook
 *
 * Manages checkpoint and verification state.
 */

import { useState, useEffect } from 'preact/hooks';
import { getDbClient } from '../../db/client';
import type { Checkpoint, VerificationResult } from '../../db/types';

export interface UseProvenanceOptions {
  autoLoadCheckpoints?: boolean;
}

export function useProvenance(options: UseProvenanceOptions = {}) {
  const { autoLoadCheckpoints = false } = options;

  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [verificationResult, setVerificationResult] = useState<VerificationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Load checkpoints from database
   */
  const loadCheckpoints = async () => {
    setLoading(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const result = await dbClient.getCheckpoints();
      setCheckpoints(result);
      console.log('[Provenance] Loaded', result.length, 'checkpoints');
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[Provenance] Failed to load checkpoints:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Verify a page
   */
  const verifyPage = async (gid: string) => {
    setVerifying(true);
    setError(null);

    try {
      const dbClient = getDbClient();
      const result = await dbClient.verifyPage(gid);
      setVerificationResult(result);
      console.log('[Provenance] Verification result:', result);
    } catch (err) {
      const errorMsg = String(err);
      setError(errorMsg);
      console.error('[Provenance] Failed to verify page:', err);
    } finally {
      setVerifying(false);
    }
  };

  /**
   * Clear verification result
   */
  const clearVerification = () => {
    setVerificationResult(null);
  };

  /**
   * Auto-load checkpoints on mount
   */
  useEffect(() => {
    if (autoLoadCheckpoints) {
      loadCheckpoints();
    }
  }, [autoLoadCheckpoints]);

  return {
    // State
    checkpoints,
    verificationResult,
    loading,
    verifying,
    error,

    // Computed
    checkpointCount: checkpoints.length,
    latestCheckpoint: checkpoints[0] || null,

    // Actions
    loadCheckpoints,
    verifyPage,
    clearVerification,
  };
}
