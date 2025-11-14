/**
 * GlyphCase Manager - Unified interface for Static and Dynamic GlyphCases
 *
 * CANONICAL FORMAT: A GlyphCase is ALWAYS one self-contained SQLite/SQLAR file.
 * - Standard .gcase  = Core only (immutable)
 * - Dynamic  .gcase+ = Core + Envelope tables in ONE file
 * - Active   .gcasex = Core + Envelope + Apps registry in ONE file
 *
 * RUNTIME IMPLEMENTATION: Uses OPFS sidecar for Envelope writes (performance).
 * The sidecar is invisible to users and gets merged into the canonical file on export.
 *
 * Handles:
 * - Modality detection (static vs dynamic)
 * - Core (DbClient) initialization
 * - Envelope sidecar initialization (runtime write buffer)
 * - Stream event publishing
 * - Canonical export (merges Core + Envelope into single file)
 * - Unified memory API
 */

import { DbClient } from './client';
import { EnvelopeManager, type Modality, type EnvelopeStats } from './envelope.manager';
import { stream, publishCapsuleLoaded, publishCapsuleUnloaded } from '../core/stream';
import type { CapsuleInfo } from './rpc-contract';

export interface GlyphCaseInfo extends CapsuleInfo {
  modality: Modality;
  envelopeStats?: EnvelopeStats;
}

/**
 * GlyphCaseManager - Manages both Core and Envelope databases
 */
export class GlyphCaseManager {
  private dbClient: DbClient;
  private envelopeManager: EnvelopeManager;
  private currentModality: Modality = 'static';
  private currentFile: File | null = null;
  private currentInfo: GlyphCaseInfo | null = null;

  constructor() {
    this.dbClient = new DbClient();
    this.envelopeManager = new EnvelopeManager();
  }

  /**
   * Detect modality preference from localStorage
   */
  private getModalityPreference(): 'auto' | 'static' | 'dynamic' {
    return (localStorage.getItem('glyphcase.modality') || 'auto') as 'auto' | 'static' | 'dynamic';
  }

  /**
   * Save modality preference
   */
  setModalityPreference(mode: 'auto' | 'static' | 'dynamic'): void {
    localStorage.setItem('glyphcase.modality', mode);
  }

  /**
   * Detect modality for a capsule file
   */
  private async detectModality(file: File): Promise<Modality> {
    const preference = this.getModalityPreference();

    // If user explicitly wants static, use static
    if (preference === 'static') {
      return 'static';
    }

    // If user explicitly wants dynamic, or auto and envelope exists
    if (preference === 'dynamic') {
      return 'dynamic';
    }

    // Auto mode: check if envelope exists
    const hasEnvelope = await EnvelopeManager.exists(file);
    return hasEnvelope ? 'dynamic' : 'static';
  }

  /**
   * Open a GlyphCase from a file
   */
  async openFromFile(file: File, requestDynamic?: boolean): Promise<GlyphCaseInfo> {
    this.currentFile = file;

    // Open Core database
    const coreInfo = await this.dbClient.openFromFile(file);

    // Determine modality
    let modality: Modality;
    if (requestDynamic !== undefined) {
      modality = requestDynamic ? 'dynamic' : 'static';
    } else {
      modality = await this.detectModality(file);
    }

    this.currentModality = modality;

    // If dynamic, initialize envelope
    let envelopeStats: EnvelopeStats | undefined;
    if (modality === 'dynamic') {
      // Get sqlite3 instance from worker (we'll need to add this to the API)
      // For now, we'll handle envelope separately when needed
      console.log('[GlyphCase] Dynamic mode - envelope will be initialized on first write');
    }

    this.currentInfo = {
      ...coreInfo,
      modality,
      envelopeStats
    };

    // Publish to stream
    publishCapsuleLoaded({
      gid: coreInfo.docId || 'unknown',
      title: coreInfo.title || 'Untitled',
      modality
    });

    return this.currentInfo;
  }

  /**
   * Open demo capsule
   */
  async openDemo(): Promise<GlyphCaseInfo> {
    const coreInfo = await this.dbClient.openDemo();

    this.currentModality = 'static'; // Demo is always static
    this.currentInfo = {
      ...coreInfo,
      modality: 'static'
    };

    publishCapsuleLoaded({
      gid: coreInfo.docId || 'demo',
      title: coreInfo.title || 'Demo',
      modality: 'static'
    });

    return this.currentInfo;
  }

  /**
   * Enable dynamic mode for current capsule
   */
  async enableDynamicMode(): Promise<void> {
    if (!this.currentFile) {
      throw new Error('No capsule loaded');
    }

    if (this.currentModality === 'dynamic') {
      console.log('[GlyphCase] Already in dynamic mode');
      return;
    }

    // Initialize envelope (will be created on first write)
    this.currentModality = 'dynamic';

    if (this.currentInfo) {
      this.currentInfo.modality = 'dynamic';
    }

    console.log('[GlyphCase] Enabled dynamic mode');
  }

  /**
   * Get current modality
   */
  getModality(): Modality {
    return this.currentModality;
  }

  /**
   * Get current GlyphCase info
   */
  getInfo(): GlyphCaseInfo | null {
    return this.currentInfo;
  }

  /**
   * Check if dynamic mode is enabled
   */
  isDynamic(): boolean {
    return this.currentModality === 'dynamic';
  }

  /**
   * Get the core database client
   */
  getCore(): DbClient {
    return this.dbClient;
  }

  /**
   * Get the envelope manager
   */
  getEnvelope(): EnvelopeManager {
    return this.envelopeManager;
  }

  /**
   * Get stream instance
   */
  getStream() {
    return stream;
  }

  /**
   * Close the GlyphCase
   */
  async close(): Promise<void> {
    // Close envelope if open
    if (this.envelopeManager.isOpen()) {
      this.envelopeManager.close();
    }

    // Close core database
    await this.dbClient.close();

    // Reset state
    this.currentModality = 'static';
    this.currentFile = null;
    this.currentInfo = null;

    // Publish to stream
    publishCapsuleUnloaded();
  }

  /**
   * Export canonical .gcase+ file (Core + Envelope merged into one file)
   *
   * This is the CANONICAL export format per the GlyphCase specification.
   * The result is a single, self-contained SQLite file with both Core
   * and Envelope tables merged together.
   *
   * For static mode, returns the Core database only.
   * For dynamic mode, merges Core + Envelope sidecar into one file.
   *
   * @returns Blob containing the .gcase or .gcase+ file
   */
  async exportGlyphCase(): Promise<Blob> {
    // Get Core database bytes from worker
    const coreBytes = await this.dbClient.exportDatabase();

    // If static mode or no envelope, just return Core
    if (this.currentModality === 'static' || !this.envelopeManager.isOpen()) {
      console.log('[GlyphCase] Exporting Standard GlyphCase (Core only)');
      return new Blob([coreBytes], { type: 'application/x-sqlite3' });
    }

    // Dynamic mode: merge Core + Envelope
    console.log('[GlyphCase] Exporting Dynamic GlyphCase (.gcase+)');
    return this.envelopeManager.mergeWithCore(coreBytes);
  }

  /**
   * Export sidecar for debugging (if in dynamic mode)
   *
   * @deprecated Use exportGlyphCase() for canonical single-file export.
   * This method exports the runtime sidecar for debugging/inspection only.
   */
  async exportEnvelopeSidecar(): Promise<Blob | null> {
    if (!this.envelopeManager.isOpen()) {
      return null;
    }

    return this.envelopeManager.exportSidecar();
  }

  /**
   * Clear envelope data (if in dynamic mode)
   */
  async clearEnvelope(): Promise<void> {
    if (!this.envelopeManager.isOpen()) {
      return;
    }

    await this.envelopeManager.clear();

    // Update stats
    if (this.currentInfo) {
      this.currentInfo.envelopeStats = this.envelopeManager.getStats() || undefined;
    }
  }

  /**
   * Get envelope statistics
   */
  getEnvelopeStats(): EnvelopeStats | null {
    return this.envelopeManager.getStats();
  }

  /**
   * Verify envelope integrity
   */
  async verifyEnvelope(): Promise<{ valid: boolean; errors: string[] } | null> {
    if (!this.envelopeManager.isOpen()) {
      return null;
    }

    return this.envelopeManager.verify();
  }
}

/**
 * Singleton GlyphCase manager instance
 */
export const glyphCaseManager = new GlyphCaseManager();
