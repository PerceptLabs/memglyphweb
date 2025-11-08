/**
 * Tests for GCUI detector
 */

import { describe, it, expect, vi } from 'vitest';
import { detectCapabilities, loadGcuiContext } from '../detector';

describe('GCUI Detector', () => {
  it('should detect generic mode when no GCUI tables exist', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([
        { name: 'documents' },
        { name: 'pages' },
      ]),
    };

    const capabilities = await detectCapabilities(mockDb as any);

    expect(capabilities.mode).toBe('generic');
    expect(capabilities.hasWebsite).toBe(false);
    expect(capabilities.hasDashboards).toBe(false);
  });

  it('should detect website mode when _ui_pages exists', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([
        { name: '_ui_pages' },
        { name: 'documents' },
      ]),
    };

    const capabilities = await detectCapabilities(mockDb as any);

    expect(capabilities.mode).toBe('website');
    expect(capabilities.hasWebsite).toBe(true);
  });

  it('should detect dashboard mode when _ui_dashboards exists', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([
        { name: '_ui_dashboards' },
        { name: 'data' },
      ]),
    };

    const capabilities = await detectCapabilities(mockDb as any);

    expect(capabilities.mode).toBe('dashboard');
    expect(capabilities.hasDashboards).toBe(true);
  });

  it('should detect hybrid mode when both exist', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([
        { name: '_ui_pages' },
        { name: '_ui_dashboards' },
        { name: 'data' },
      ]),
    };

    const capabilities = await detectCapabilities(mockDb as any);

    expect(capabilities.mode).toBe('hybrid');
    expect(capabilities.hasWebsite).toBe(true);
    expect(capabilities.hasDashboards).toBe(true);
  });

  it('should detect FTS capability', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([
        { name: 'fts_documents' },
        { name: 'documents' },
      ]),
    };

    const capabilities = await detectCapabilities(mockDb as any);

    expect(capabilities.hasFTS).toBe(true);
  });

  it('should detect navigation capability', async () => {
    const mockDb = {
      query: vi.fn().mockResolvedValue([
        { name: '_ui_navigation' },
        { name: '_ui_pages' },
      ]),
    };

    const capabilities = await detectCapabilities(mockDb as any);

    expect(capabilities.hasNavigation).toBe(true);
  });

  it('should load complete GCUI context', async () => {
    const mockDb = {
      query: vi.fn()
        .mockResolvedValueOnce([{ name: '_ui_pages' }]) // Table list
        .mockResolvedValueOnce([{ key: 'gcui', value: '1.0' }]) // Manifest
        .mockResolvedValueOnce([{ key: 'site_title', value: 'Test Site' }]) // Config
        .mockResolvedValueOnce([
          { slug: '/', title: 'Home', content: '# Home', layout: 'simple', category: null, order_index: 0 },
        ]) // Pages
        .mockResolvedValueOnce([]) // Navigation
        .mockResolvedValueOnce([]), // Dashboards
    };

    const context = await loadGcuiContext(mockDb as any);

    expect(context.manifest.gcui).toBe('1.0');
    expect(context.config.site_title).toBe('Test Site');
    expect(context.pages.length).toBe(1);
    expect(context.pages[0].slug).toBe('/');
  });
});
