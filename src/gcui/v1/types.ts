/**
 * GlyphCapsule UI Specification v1.0 - TypeScript Types
 *
 * Type definitions for GCUI-compliant SQLAR capsules.
 */

// ============================================================================
// Core Metadata
// ============================================================================

export interface GcuiManifest {
  gcui: string;                 // GCUI version (e.g., "1.0")
  capsule_kind: string;         // "sqlar"
  created?: string;             // ISO date
  title?: string;               // Capsule title
  [key: string]: string | undefined;
}

export interface GcuiCapability {
  feature: string;              // Feature name (e.g., "ui_pages")
  required: boolean;            // Is this feature required?
  version: string;              // Feature version (e.g., "1.0")
}

// ============================================================================
// Website Mode
// ============================================================================

export type LayoutType =
  | 'landing'       // Hero, features, CTAs
  | 'docs'          // Sidebar, TOC, breadcrumbs
  | 'reference'     // API docs style
  | 'article'       // Blog post style
  | 'simple'        // Minimal chrome
  | 'dashboard'     // Widget grid
  | string;         // Custom layouts

export interface GcuiPage {
  slug: string;                 // URL path (e.g., "/" or "/docs/api")
  title: string;
  content?: string;             // Markdown content
  layout?: LayoutType;
  category?: string;            // For grouping
  order_index?: number;         // Sort order
}

export interface GcuiConfig {
  // Routing
  home?: string;                // Home page slug

  // Branding
  site_title?: string;
  logo_asset?: string;          // asset:// URL

  // Theme
  theme_primary?: string;       // Hex color
  theme_background?: string;
  theme_mode?: 'light' | 'dark';

  // Typography
  font_heading?: string;
  font_body?: string;

  // Landing page
  hero_title?: string;
  hero_subtitle?: string;
  hero_image?: string;          // asset:// URL

  // Layout
  layout_max_width?: string;    // CSS value
  layout_sidebar_width?: string;
  layout_header_height?: string;

  // Custom keys allowed
  [key: string]: string | undefined;
}

export type NavigationMenu = 'header' | 'sidebar' | 'footer' | string;

export interface GcuiNavigation {
  menu: NavigationMenu;
  label: string;
  to_slug: string;              // Link target
  order_index?: number;
  icon_asset?: string;          // asset:// URL
}

// ============================================================================
// Dashboard Mode
// ============================================================================

export type ChartGrammar =
  | 'vegalite-lite-v1'
  | string;                     // Future grammars

export interface GcuiDashboard {
  name: string;
  query: string;                // SQL query
  grammar?: ChartGrammar;
  config?: string;              // JSON string (parse to VegaLiteConfig)
}

// Vega-Lite-Lite v1 Types
export type MarkType = 'line' | 'bar' | 'point' | 'area' | 'arc';
export type EncodingType = 'temporal' | 'quantitative' | 'nominal' | 'ordinal';
export type AggregateType = 'count' | 'sum' | 'mean' | 'min' | 'max';

export interface VegaLiteEncoding {
  field: string;
  type: EncodingType;
  aggregate?: AggregateType;
}

export interface VegaLiteConfig {
  mark: MarkType;
  encoding: {
    x?: VegaLiteEncoding;
    y?: VegaLiteEncoding;
    color?: VegaLiteEncoding;
    size?: VegaLiteEncoding;
  };
  title?: string;
  width?: number;
  height?: number;
}

// Query Parameters
export type ParamType = 'string' | 'number' | 'enum' | 'date' | 'boolean';

export interface GcuiParam {
  view_name: string;            // Dashboard/view name
  param_name: string;           // Parameter name (without :)
  param_type: ParamType;
  default_value?: string;
  allowed_values?: string;      // JSON array for enum types
}

// ============================================================================
// Capability Detection
// ============================================================================

export interface GcuiCapabilities {
  version: string;              // GCUI version
  hasWebsite: boolean;          // Has _ui_pages
  hasDashboards: boolean;       // Has _ui_dashboards
  hasNavigation: boolean;       // Has _ui_navigation
  hasParams: boolean;           // Has _ui_params
  hasFTS: boolean;              // Has FTS5 tables
  hasAssets: boolean;           // Has sqlar table
  mode: 'website' | 'dashboard' | 'hybrid' | 'generic';
}

// ============================================================================
// Rendering Context
// ============================================================================

export interface GcuiContext {
  manifest: GcuiManifest;
  capabilities: GcuiCapabilities;
  config: GcuiConfig;
  pages: GcuiPage[];
  navigation: GcuiNavigation[];
  dashboards: GcuiDashboard[];
}

// ============================================================================
// Database Schema (for type-safe queries)
// ============================================================================

export interface GcuiTables {
  _meta_manifest: { key: string; value: string };
  _meta_capabilities: { feature: string; required: number; version: string };
  _ui_pages: {
    slug: string;
    title: string;
    content: string | null;
    layout: string | null;
    category: string | null;
    order_index: number | null;
  };
  _ui_config: { key: string; value: string };
  _ui_navigation: {
    menu: string;
    label: string;
    to_slug: string;
    order_index: number | null;
    icon_asset: string | null;
  };
  _ui_dashboards: {
    name: string;
    query: string;
    grammar: string | null;
    config: string | null;
  };
  _ui_params: {
    view_name: string;
    param_name: string;
    param_type: string;
    default_value: string | null;
    allowed_values: string | null;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

export type AssetURL = `asset://${string}`;

export interface ParsedAsset {
  protocol: 'asset';
  path: string;               // e.g., "assets/logo.svg"
}

export function parseAssetURL(url: string): ParsedAsset | null {
  if (!url.startsWith('asset://')) return null;
  return {
    protocol: 'asset',
    path: url.slice(8), // Remove "asset://"
  };
}

// ============================================================================
// Validation
// ============================================================================

export interface GcuiValidationError {
  table: string;
  field?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface GcuiValidationResult {
  valid: boolean;
  errors: GcuiValidationError[];
  warnings: GcuiValidationError[];
}

// ============================================================================
// Compliance Levels
// ============================================================================

export enum GcuiComplianceLevel {
  Generic = 0,        // Ignore GCUI, just show tables
  Website = 1,        // Render pages, config, navigation
  Dashboard = 2,      // Add charts, params
  Full = 3,           // All features, advanced layouts
}

export interface GcuiReaderCapabilities {
  level: GcuiComplianceLevel;
  supportedGrammars: ChartGrammar[];
  supportedLayouts: LayoutType[];
  maxQueryRows: number;
  maxQueryTimeout: number;
  maxChartPoints: number;
  sanitizeHTML: boolean;
}
