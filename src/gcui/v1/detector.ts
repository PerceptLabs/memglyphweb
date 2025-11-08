/**
 * GCUI Capability Detector
 *
 * Analyzes SQLAR capsules to detect GCUI features and rendering mode.
 */

import type { DbClient } from '../../db/client';
import type {
  GcuiCapabilities,
  GcuiManifest,
  GcuiConfig,
  GcuiPage,
  GcuiNavigation,
  GcuiDashboard,
  GcuiContext,
} from './types';

/**
 * Detect GCUI capabilities from a loaded capsule
 */
export async function detectCapabilities(db: DbClient): Promise<GcuiCapabilities> {
  // Get all table names
  const tables = await db.query<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table'"
  );
  const tableNames = tables.map((t) => t.name);

  // Check for GCUI tables
  const hasPages = tableNames.includes('_ui_pages');
  const hasDashboards = tableNames.includes('_ui_dashboards');
  const hasNavigation = tableNames.includes('_ui_navigation');
  const hasParams = tableNames.includes('_ui_params');
  const hasManifest = tableNames.includes('_meta_manifest');
  const hasAssets = tableNames.includes('sqlar');

  // Check for FTS5 tables
  const hasFTS = tableNames.some((name) => name.startsWith('fts_'));

  // Get GCUI version
  let version = '1.0'; // Default
  if (hasManifest) {
    try {
      const result = await db.query<{ value: string }>(
        "SELECT value FROM _meta_manifest WHERE key='gcui'"
      );
      if (result.length > 0) {
        version = result[0].value;
      }
    } catch (err) {
      console.warn('Failed to read GCUI version:', err);
    }
  }

  // Determine mode
  let mode: 'website' | 'dashboard' | 'hybrid' | 'generic';
  if (hasPages && hasDashboards) {
    mode = 'hybrid';
  } else if (hasPages) {
    mode = 'website';
  } else if (hasDashboards) {
    mode = 'dashboard';
  } else {
    mode = 'generic';
  }

  return {
    version,
    hasWebsite: hasPages,
    hasDashboards,
    hasNavigation,
    hasParams,
    hasFTS,
    hasAssets,
    mode,
  };
}

/**
 * Load manifest from capsule
 */
export async function loadManifest(db: DbClient): Promise<GcuiManifest | null> {
  try {
    const rows = await db.query<{ key: string; value: string }>(
      'SELECT key, value FROM _meta_manifest'
    );

    if (rows.length === 0) return null;

    const manifest: GcuiManifest = {
      gcui: '1.0',
      capsule_kind: 'sqlar',
    };

    rows.forEach((row) => {
      manifest[row.key] = row.value;
    });

    return manifest;
  } catch (err) {
    console.warn('Failed to load manifest:', err);
    return null;
  }
}

/**
 * Load configuration from capsule
 */
export async function loadConfig(db: DbClient): Promise<GcuiConfig> {
  try {
    const rows = await db.query<{ key: string; value: string }>(
      'SELECT key, value FROM _ui_config'
    );

    const config: GcuiConfig = {};
    rows.forEach((row) => {
      config[row.key] = row.value;
    });

    return config;
  } catch (err) {
    console.warn('Failed to load config:', err);
    return {};
  }
}

/**
 * Load all pages from capsule
 */
export async function loadPages(db: DbClient): Promise<GcuiPage[]> {
  try {
    const rows = await db.query<{
      slug: string;
      title: string;
      content: string | null;
      layout: string | null;
      category: string | null;
      order_index: number | null;
    }>('SELECT slug, title, content, layout, category, order_index FROM _ui_pages ORDER BY order_index ASC, slug ASC');

    return rows.map((row) => ({
      slug: row.slug,
      title: row.title,
      content: row.content || undefined,
      layout: row.layout || undefined,
      category: row.category || undefined,
      order_index: row.order_index || undefined,
    }));
  } catch (err) {
    console.warn('Failed to load pages:', err);
    return [];
  }
}

/**
 * Load navigation items
 */
export async function loadNavigation(db: DbClient): Promise<GcuiNavigation[]> {
  try {
    const rows = await db.query<{
      menu: string;
      label: string;
      to_slug: string;
      order_index: number | null;
      icon_asset: string | null;
    }>('SELECT menu, label, to_slug, order_index, icon_asset FROM _ui_navigation ORDER BY menu, order_index ASC');

    return rows.map((row) => ({
      menu: row.menu,
      label: row.label,
      to_slug: row.to_slug,
      order_index: row.order_index || undefined,
      icon_asset: row.icon_asset || undefined,
    }));
  } catch (err) {
    console.warn('Failed to load navigation:', err);
    return [];
  }
}

/**
 * Load dashboards
 */
export async function loadDashboards(db: DbClient): Promise<GcuiDashboard[]> {
  try {
    const rows = await db.query<{
      name: string;
      query: string;
      grammar: string | null;
      config: string | null;
    }>('SELECT name, query, grammar, config FROM _ui_dashboards');

    return rows.map((row) => ({
      name: row.name,
      query: row.query,
      grammar: row.grammar || undefined,
      config: row.config || undefined,
    }));
  } catch (err) {
    console.warn('Failed to load dashboards:', err);
    return [];
  }
}

/**
 * Load complete GCUI context
 */
export async function loadGcuiContext(db: DbClient): Promise<GcuiContext> {
  const capabilities = await detectCapabilities(db);
  const manifest = (await loadManifest(db)) || {
    gcui: capabilities.version,
    capsule_kind: 'sqlar',
  };

  const config = await loadConfig(db);
  const pages = capabilities.hasWebsite ? await loadPages(db) : [];
  const navigation = capabilities.hasNavigation ? await loadNavigation(db) : [];
  const dashboards = capabilities.hasDashboards ? await loadDashboards(db) : [];

  return {
    manifest,
    capabilities,
    config,
    pages,
    navigation,
    dashboards,
  };
}

/**
 * Get home page slug from config or default to first page
 */
export function getHomeSlug(context: GcuiContext): string {
  if (context.config.home) {
    return context.config.home;
  }

  if (context.pages.length > 0) {
    return context.pages[0].slug;
  }

  return '/';
}

/**
 * Find page by slug
 */
export function findPage(context: GcuiContext, slug: string): GcuiPage | null {
  return context.pages.find((page) => page.slug === slug) || null;
}

/**
 * Get navigation items for a specific menu
 */
export function getNavigationForMenu(
  context: GcuiContext,
  menu: string
): GcuiNavigation[] {
  return context.navigation.filter((nav) => nav.menu === menu);
}
