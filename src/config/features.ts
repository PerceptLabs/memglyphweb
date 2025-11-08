/**
 * Feature Configuration System
 *
 * Controls which features are enabled and how the app behaves in different deployment modes.
 */

export type DeploymentMode = 'website' | 'viewer';

export interface FeatureConfig {
  // Core features
  llm: {
    enabled: boolean;
    autoReason: boolean;          // Auto-trigger reasoning after search
    defaultModel: string;
    maxTokens: number;
  };

  search: {
    defaultMode: 'fts' | 'hybrid' | 'graph';
    enabledModes: Array<'fts' | 'hybrid' | 'graph'>;
    showModeToggle: boolean;
  };

  graph: {
    enabled: boolean;
    maxHops: number;
    defaultMaxHops: number;
  };

  upload: {
    enabled: boolean;             // Allow user file uploads
    acceptedExtensions: string[]; // e.g., ['.sqlite', '.sqlar']
  };

  gcui: {
    enabled: boolean;             // Support GCUI rendering
    fallbackToGeneric: boolean;   // Fall back to generic browser if no GCUI tables
  };

  pwa: {
    enabled: boolean;
    offlineMode: boolean;
  };
}

export interface DeploymentConfig {
  mode: DeploymentMode;
  bundledCapsule: string | null;  // Path to bundled SQLAR (e.g., "/memglyph-demo.mgx.sqlite")
  branding: {
    title: string;
    tagline: string;
    logoUrl?: string;
  };
  features: FeatureConfig;
  ui: {
    showLanding: boolean;         // Show landing page on load
    theme: 'documentation' | 'tool' | 'custom';
  };
}

// ============================================================================
// Mode Configurations
// ============================================================================

const WEBSITE_CONFIG: DeploymentConfig = {
  mode: 'website',
  bundledCapsule: '/memglyph-demo.mgx.sqlite',
  branding: {
    title: 'Memglyph',
    tagline: 'Your knowledge, crystallized',
    logoUrl: '/logo.svg',
  },
  features: {
    llm: {
      enabled: true,
      autoReason: false,          // Manual trigger for docs site
      defaultModel: 'qwen3-0.6b',
      maxTokens: 256,
    },
    search: {
      defaultMode: 'hybrid',
      enabledModes: ['fts', 'hybrid'],
      showModeToggle: false,      // Hide complexity for docs
    },
    graph: {
      enabled: true,
      maxHops: 2,
      defaultMaxHops: 1,
    },
    upload: {
      enabled: false,             // No upload on main site
      acceptedExtensions: [],
    },
    gcui: {
      enabled: true,
      fallbackToGeneric: false,
    },
    pwa: {
      enabled: true,
      offlineMode: true,
    },
  },
  ui: {
    showLanding: true,
    theme: 'documentation',
  },
};

const VIEWER_CONFIG: DeploymentConfig = {
  mode: 'viewer',
  bundledCapsule: '/memglyph-demo.mgx.sqlite', // Still include demo
  branding: {
    title: 'SQLAR Viewer',
    tagline: 'Query your knowledge capsules',
    logoUrl: '/sqlar-logo.svg',
  },
  features: {
    llm: {
      enabled: true,
      autoReason: false,
      defaultModel: 'qwen3-0.6b',
      maxTokens: 256,
    },
    search: {
      defaultMode: 'hybrid',
      enabledModes: ['fts', 'hybrid', 'graph'],
      showModeToggle: true,       // Full features
    },
    graph: {
      enabled: true,
      maxHops: 3,
      defaultMaxHops: 2,
    },
    upload: {
      enabled: true,              // Key feature: upload capability
      acceptedExtensions: ['.sqlite', '.sqlar', '.db', '.mgx.sqlite'],
    },
    gcui: {
      enabled: true,
      fallbackToGeneric: true,    // Support any SQLAR file
    },
    pwa: {
      enabled: true,
      offlineMode: true,
    },
  },
  ui: {
    showLanding: false,           // Go straight to tool
    theme: 'tool',
  },
};

// ============================================================================
// Active Configuration
// ============================================================================

/**
 * Determine deployment mode from environment
 */
function getDeploymentMode(): DeploymentMode {
  const envMode = import.meta.env.VITE_MODE;
  if (envMode === 'viewer' || envMode === 'website') {
    return envMode;
  }
  return 'website'; // Default
}

/**
 * Get configuration for current deployment mode
 */
export function getConfig(): DeploymentConfig {
  const mode = getDeploymentMode();
  return mode === 'viewer' ? VIEWER_CONFIG : WEBSITE_CONFIG;
}

/**
 * Check if a specific feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureConfig): boolean {
  const config = getConfig();
  return config.features[feature]?.enabled ?? false;
}

/**
 * Get feature-specific config
 */
export function getFeatureConfig<K extends keyof FeatureConfig>(
  feature: K
): FeatureConfig[K] {
  const config = getConfig();
  return config.features[feature];
}

// ============================================================================
// Constants
// ============================================================================

export const PERFORMANCE_LIMITS = {
  MAX_QUERY_ROWS: 10000,
  QUERY_TIMEOUT_MS: 5000,
  MAX_CHART_POINTS: 1000,
  MAX_SQLAR_SIZE_MB: 500,
  MAX_CONCURRENT_QUERIES: 5,
} as const;

export const SUPPORTED_VEGA_GRAMMARS = ['vegalite-lite-v1'] as const;

export const SUPPORTED_LAYOUTS = [
  'landing',
  'docs',
  'reference',
  'article',
  'simple',
  'dashboard',
] as const;
