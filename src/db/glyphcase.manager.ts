/**
 * GlyphCase Manager - Unified interface for Static and Dynamic GlyphCases
 *
 * CANONICAL FORMAT: A GlyphCase is ALWAYS one self-contained SQLite/SQLAR file.
 * - Standard .gcase  = Core only (immutable)
 * - Dynamic  .gcase+ = Core + Envelope tables in ONE file
 * - Active   .gcasex = Core + Envelope + Apps registry in ONE file
 *
 * RUNTIME IMPLEMENTATION: Uses OPFS sidecar for Envelope writes (performance).
 * The sidecar is invisible to users and gets merged into the canonical file when saved.
 *
 * Handles:
 * - Modality detection (static vs dynamic)
 * - Core (DbClient) initialization
 * - Envelope sidecar initialization (runtime write buffer)
 * - Stream event publishing
 * - Canonical save (merges Core + Envelope into single file)
 * - Unified memory API
 */

import { DbClient } from './client';
import { EnvelopeManager, type Modality, type EnvelopeStats } from './envelope.manager';
import { stream, publishCapsuleLoaded, publishCapsuleUnloaded } from '../core/stream';
import type { CapsuleInfo } from './rpc-contract';
import { getLogger } from '@logtape/logtape';

const logger = getLogger(['glyphcase']);

export interface GlyphCaseInfo extends CapsuleInfo {
  modality: Modality;
  envelopeStats?: EnvelopeStats;
  envelopeExtracted?: boolean; // True if envelope was extracted from canonical .gcase+ file
  hasScripts?: boolean; // True if TCMR scripts detected (via metadata or /scripts/ directory)
  hasPandaCss?: boolean; // True if Panda CSS detected (via metadata or /gc/ui/ directory)
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

    // Detect Active GlyphCase (.gcasex) - apps are not supported in PWA
    if (file.name.endsWith('.gcasex')) {
      logger.info('Active GlyphCase detected', {
        filename: file.name,
        note: 'WASM apps not supported in PWA - treating as Dynamic mode'
      });
      // Apps_registry tables will be ignored, file treated as .gcase+
    }

    // Check if file has envelope tables embedded (canonical .gcase+ or .gcasex format)
    const fileBytes = new Uint8Array(await file.arrayBuffer());
    const hasEnvelope = await this.dbClient.hasEnvelopeTables(fileBytes);

    if (hasEnvelope) {
      logger.info('Detected canonical file with embedded envelope', {
        filename: file.name
      });

      // Extract envelope tables to OPFS sidecar for runtime writes
      await this.dbClient.extractEnvelope(file);
      logger.info('Envelope extracted to runtime sidecar');
    }

    // Open Core database
    const coreInfo = await this.dbClient.openFromFile(file);

    // Detect TCMR scripts
    let hasScripts = false;
    try {
      // Method 1: Check metadata for mgqd_extensions
      const metadataRows = await this.dbClient.query(
        'SELECT value FROM _metadata WHERE key = ?',
        ['mgqd_extensions']
      );

      if (metadataRows.length > 0) {
        try {
          const extensions = JSON.parse(metadataRows[0].value);
          if (Array.isArray(extensions) && extensions.includes('tcmr')) {
            hasScripts = true;
            logger.info('TCMR scripts detected via metadata', {
              filename: file.name,
              extensions
            });
          }
        } catch (parseErr) {
          logger.warn('Failed to parse mgqd_extensions metadata', {
            filename: file.name,
            error: parseErr
          });
        }
      }

      // Method 2: Fallback - scan for /scripts/ directory in sqlar
      if (!hasScripts) {
        const scriptRows = await this.dbClient.query(
          "SELECT COUNT(*) as count FROM sqlar WHERE name LIKE 'scripts/%'",
          []
        );

        if (scriptRows.length > 0 && scriptRows[0].count > 0) {
          hasScripts = true;
          logger.warn('TCMR scripts detected via directory scan', {
            filename: file.name,
            scriptCount: scriptRows[0].count,
            recommendation: 'Add "tcmr" to mgqd_extensions in _metadata'
          });
        }
      }

      if (hasScripts) {
        logger.info('TCMR support detected', {
          filename: file.name,
          note: 'Scripts are not executable in PWA (display only)'
        });
      }
    } catch (err) {
      // Don't fail if TCMR detection fails - just log and continue
      logger.debug('TCMR detection skipped', {
        filename: file.name,
        reason: 'No _metadata or sqlar tables (expected for some formats)'
      });
    }

    // Detect Panda CSS
    let hasPandaCss = false;
    try {
      // Method 1: Check metadata for mgqd_extensions
      const metadataRows = await this.dbClient.query(
        'SELECT value FROM _metadata WHERE key = ?',
        ['mgqd_extensions']
      );

      if (metadataRows.length > 0) {
        try {
          const extensions = JSON.parse(metadataRows[0].value);
          if (Array.isArray(extensions) && extensions.includes('panda-css')) {
            hasPandaCss = true;
            logger.info('Panda CSS detected via metadata', {
              filename: file.name,
              extensions
            });
          }
        } catch (parseErr) {
          logger.warn('Failed to parse mgqd_extensions metadata', {
            filename: file.name,
            error: parseErr
          });
        }
      }

      // Method 2: Fallback - scan for /gc/ui/ directory in sqlar
      if (!hasPandaCss) {
        const pandaRows = await this.dbClient.query(
          "SELECT COUNT(*) as count FROM sqlar WHERE name LIKE 'gc/ui/%'",
          []
        );

        if (pandaRows.length > 0 && pandaRows[0].count > 0) {
          hasPandaCss = true;
          logger.warn('Panda CSS detected via directory scan', {
            filename: file.name,
            fileCount: pandaRows[0].count,
            recommendation: 'Add "panda-css" to mgqd_extensions in _metadata'
          });
        }
      }

      if (hasPandaCss) {
        logger.info('Panda CSS support detected', {
          filename: file.name,
          note: 'Design tokens and styles available for UI enhancement'
        });
      }
    } catch (err) {
      // Don't fail if Panda CSS detection fails - just log and continue
      logger.debug('Panda CSS detection skipped', {
        filename: file.name,
        reason: 'No _metadata or sqlar tables (expected for some formats)'
      });
    }

    // Determine modality
    let modality: Modality;
    if (requestDynamic !== undefined) {
      modality = requestDynamic ? 'dynamic' : 'static';
    } else if (hasEnvelope) {
      // File has envelope, automatically use dynamic mode
      modality = 'dynamic';
    } else {
      modality = await this.detectModality(file);
    }

    this.currentModality = modality;

    // If dynamic, get envelope stats
    let envelopeStats: EnvelopeStats | undefined;
    if (modality === 'dynamic') {
      // Envelope is now available in OPFS sidecar
      envelopeStats = this.envelopeManager.getStats() || undefined;
      logger.info('Dynamic mode active', {
        filename: file.name,
        stats: envelopeStats
      });
    }

    this.currentInfo = {
      ...coreInfo,
      modality,
      envelopeStats,
      envelopeExtracted: hasEnvelope,
      hasScripts,
      hasPandaCss
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
      logger.info('Already in dynamic mode');
      return;
    }

    // Initialize envelope (will be created on first write)
    this.currentModality = 'dynamic';

    if (this.currentInfo) {
      this.currentInfo.modality = 'dynamic';
    }

    logger.info('Enabled dynamic mode');
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
   * Save canonical .gcase+ file (Core + Envelope merged into one file)
   *
   * This creates the CANONICAL single-file format per the GlyphCase specification.
   * The result is a self-contained SQLite file with both Core and Envelope tables.
   *
   * For static mode, returns the Core database only (.gcase).
   * For dynamic mode, merges Core + Envelope sidecar into one file (.gcase+).
   *
   * @returns Blob containing the .gcase or .gcase+ file
   */
  async saveGlyphCase(): Promise<Blob> {
    if (!this.currentFile) {
      throw new Error('No capsule loaded');
    }

    // If static mode, just export Core
    if (this.currentModality === 'static') {
      logger.info('Saving Standard GlyphCase (Core only)');
      const coreBytes = await this.dbClient.exportDatabase();
      return new Blob([coreBytes], { type: 'application/x-sqlite3' });
    }

    // Dynamic mode: merge Core + Envelope using worker
    logger.info('Saving Dynamic GlyphCase (.gcase+)');
    const mergedBytes = await this.dbClient.mergeWithEnvelope(this.currentFile);
    return new Blob([mergedBytes], { type: 'application/x-sqlite3' });
  }

  /**
   * @deprecated Use saveGlyphCase() instead. This alias exists for backward compatibility.
   */
  async exportGlyphCase(): Promise<Blob> {
    return this.saveGlyphCase();
  }

  /**
   * Export sidecar for debugging (if in dynamic mode)
   *
   * @deprecated Use saveGlyphCase() for canonical single-file format.
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
