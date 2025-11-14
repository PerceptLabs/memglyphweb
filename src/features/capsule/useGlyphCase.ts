/**
 * GlyphCase Feature Hook
 *
 * Provides access to GlyphCase state, modality, and envelope operations.
 */

import { useState, useEffect } from 'preact/hooks';
import { glyphCaseManager, type GlyphCaseInfo } from '../../db/glyphcase.manager';
import { stream } from '../../core/stream';
import type { Modality, EnvelopeStats } from '../../db/envelope.manager';

export interface UseGlyphCaseReturn {
  info: GlyphCaseInfo | null;
  modality: Modality;
  isDynamic: boolean;
  envelopeStats: EnvelopeStats | null;
  enableDynamicMode: () => Promise<void>;
  exportGlyphCase: () => Promise<Blob>; // Canonical single-file export
  exportEnvelopeSidecar: () => Promise<Blob | null>; // Debug only
  clearEnvelope: () => Promise<void>;
  verifyEnvelope: () => Promise<{ valid: boolean; errors: string[] } | null>;
  setModalityPreference: (mode: 'auto' | 'static' | 'dynamic') => void;
}

/**
 * Hook for accessing GlyphCase state and operations
 */
export function useGlyphCase(): UseGlyphCaseReturn {
  const [info, setInfo] = useState<GlyphCaseInfo | null>(glyphCaseManager.getInfo());
  const [modality, setModality] = useState<Modality>(glyphCaseManager.getModality());
  const [envelopeStats, setEnvelopeStats] = useState<EnvelopeStats | null>(
    glyphCaseManager.getEnvelopeStats()
  );

  // Subscribe to capsule load/unload events
  useEffect(() => {
    const unsubLoaded = stream.subscribe('capsule.loaded', () => {
      setInfo(glyphCaseManager.getInfo());
      setModality(glyphCaseManager.getModality());
      setEnvelopeStats(glyphCaseManager.getEnvelopeStats());
    });

    const unsubUnloaded = stream.subscribe('capsule.unloaded', () => {
      setInfo(null);
      setModality('static');
      setEnvelopeStats(null);
    });

    // Subscribe to envelope stats updates
    const unsubStats = stream.subscribe('envelope.stats', (data) => {
      setEnvelopeStats(data);
    });

    return () => {
      unsubLoaded();
      unsubUnloaded();
      unsubStats();
    };
  }, []);

  const enableDynamicMode = async () => {
    await glyphCaseManager.enableDynamicMode();
    setModality('dynamic');
  };

  const exportGlyphCase = async () => {
    return glyphCaseManager.exportGlyphCase();
  };

  const exportEnvelopeSidecar = async () => {
    return glyphCaseManager.exportEnvelopeSidecar();
  };

  const clearEnvelope = async () => {
    await glyphCaseManager.clearEnvelope();
    setEnvelopeStats(glyphCaseManager.getEnvelopeStats());
  };

  const verifyEnvelope = async () => {
    return glyphCaseManager.verifyEnvelope();
  };

  const setModalityPreference = (mode: 'auto' | 'static' | 'dynamic') => {
    glyphCaseManager.setModalityPreference(mode);
  };

  return {
    info,
    modality,
    isDynamic: modality === 'dynamic',
    envelopeStats,
    enableDynamicMode,
    exportGlyphCase,
    exportEnvelopeSidecar,
    clearEnvelope,
    verifyEnvelope,
    setModalityPreference
  };
}
