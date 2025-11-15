# GCUI Extensions - Path Conventions

**Version:** 1.0
**Date:** 2025-11-15

This document defines the canonical path conventions for GlyphCase UI (GCUI) extensions. These conventions enable GlyphCases to bundle optional features like styling systems, scripts, and themes while maintaining backward compatibility with base GlyphCase readers.

---

## Overview

GCUI extensions follow a **discovery-based approach**:
- Extensions are detected via metadata (`mgqd_extensions` field) or directory scanning
- Missing extensions degrade gracefully (no errors)
- PWA loads extension resources on-demand
- Each extension uses a dedicated `/gc/ui/<feature>/` directory

---

## Extension Types

### 1. Panda CSS Styling System

**Purpose:** Portable design tokens, recipes, and themes for Case-specific styling

**Detection:**
- **Primary:** `mgqd_extensions: ["panda-css"]` in metadata
- **Fallback:** Directory scan for `/gc/ui/panda/`

**Path Structure:**
```
/gc/ui/
├── panda/
│   ├── styles.css          # Generated static CSS (required)
│   ├── recipes/
│   │   ├── badge.json      # Component recipe
│   │   ├── card.json
│   │   └── ...
│   └── themes/
│       ├── dark.json       # Theme definitions
│       ├── light.json
│       └── ...
├── tokens.json             # Design tokens (required for Panda CSS)
```

**Resource Loading:**
1. **Design Tokens** (`/gc/ui/tokens.json`): JSON file with colors, spacing, typography, etc.
2. **Static CSS** (`/gc/ui/panda/styles.css`): Pre-compiled CSS for global injection
3. **Recipes** (`/gc/ui/panda/recipes/*.json`): Component variant definitions
4. **Themes** (`/gc/ui/panda/themes/*.json`): Color scheme and semantic token overrides

**Example `tokens.json`:**
```json
{
  "version": "1.0",
  "colors": {
    "primary": "#6366f1",
    "secondary": "#8b5cf6",
    "success": "#10b981",
    "warning": "#f59e0b",
    "error": "#ef4444"
  },
  "spacing": {
    "xs": "4px",
    "sm": "8px",
    "md": "16px",
    "lg": "24px",
    "xl": "32px"
  },
  "typography": {
    "fontFamily": {
      "sans": "Inter, system-ui, sans-serif",
      "mono": "JetBrains Mono, monospace"
    },
    "fontSize": {
      "xs": "12px",
      "sm": "14px",
      "md": "16px",
      "lg": "18px",
      "xl": "20px"
    }
  }
}
```

**Example `recipes/badge.json`:**
```json
{
  "name": "badge",
  "base": {
    "display": "inline-flex",
    "alignItems": "center",
    "padding": "4px 8px",
    "borderRadius": "4px",
    "fontSize": "12px",
    "fontWeight": "500"
  },
  "variants": {
    "style": {
      "success": {
        "backgroundColor": "{colors.success}",
        "color": "white"
      },
      "warning": {
        "backgroundColor": "{colors.warning}",
        "color": "white"
      },
      "critical": {
        "backgroundColor": "{colors.error}",
        "color": "white"
      }
    }
  }
}
```

**Graceful Degradation:**
- If Panda CSS not detected: Use base component styles
- If tokens.json missing: Log warning, use defaults
- If styles.css missing: Log warning, continue without global styles
- If recipes/themes missing: Skip component enhancements

**Usage Pattern:**
```typescript
import { usePandaCss } from '@/features/panda/usePandaCss';
import { cn } from '@/lib/classnames';

function MyComponent() {
  const panda = usePandaCss();

  return (
    <div className={cn(
      'my-base-class',           // Base styles (always)
      panda?.recipe('card')       // Panda enhancement (optional)
    )}>
      Content
    </div>
  );
}
```

---

### 2. TCMR (Txiki Case Micro Runtime)

**Purpose:** Automation scripts for Case manipulation and workflows

**Detection:**
- **Primary:** `mgqd_extensions: ["tcmr"]` in metadata
- **Fallback:** Directory scan for `/scripts/`

**Path Structure:**
```
/scripts/
├── manifest.json           # Script metadata (optional)
├── init.js                 # Auto-run on Case open (optional)
├── exports.js              # Named automation functions (optional)
└── lib/                    # Shared libraries (optional)
    └── utils.js
```

**PWA Scope:**
- **Detection Only:** PWA detects TCMR scripts and shows indicator badge
- **No Execution:** Scripts are NOT executed in browser (security/sandboxing)
- **Use Case:** Inform users that Case has automation capabilities in native runtime

**UI Indicators:**
- **Badge:** "⚡ Scripts" appended to modality badge
- **Tooltip:** "Contains automation scripts (not executable in PWA)"
- **Color:** Accent color (e.g., amber/yellow)

**Metadata Example:**
```json
{
  "title": "Research Papers",
  "modality": "dynamic",
  "mgqd_extensions": ["tcmr"],
  "tcmr_version": "1.0"
}
```

**Fallback Detection Logic:**
```typescript
// 1. Check metadata first
const hasTcmr = metadata.mgqd_extensions?.includes('tcmr');

// 2. Fallback: scan /scripts/ directory
if (!hasTcmr) {
  const hasScripts = await dbClient.fileExists('/scripts/');
  if (hasScripts) {
    logger.warn('Scripts found without TCMR metadata', {
      recommendation: 'Add "tcmr" to mgqd_extensions'
    });
    return true; // Still show indicator
  }
}
```

---

## Metadata Schema Extension

**Field:** `mgqd_extensions`
**Type:** `string[]`
**Optional:** Yes
**Location:** `_metadata` table, key `mgqd_extensions`

**Valid Values:**
- `"panda-css"` - Panda CSS styling system
- `"tcmr"` - Txiki Case Micro Runtime scripts

**Example:**
```json
{
  "title": "Design System Demo",
  "modality": "dynamic",
  "mgqd_extensions": ["panda-css", "tcmr"],
  "panda_version": "0.50.0",
  "tcmr_version": "1.0"
}
```

---

## Design Principles

1. **Backward Compatibility:** Extensions MUST NOT break base GlyphCase readers
2. **Graceful Degradation:** Missing extensions fail silently with fallback behavior
3. **Explicit Detection:** Prefer metadata over directory scanning (performance)
4. **Lazy Loading:** Load extension resources on-demand, not at Case open
5. **Security:** No automatic script execution in browser context
6. **Observability:** Log all extension detection and loading via LogTape

---

## Logging Examples

**Panda CSS Detection:**
```typescript
logger.info('Panda CSS detected', {
  hasTokens: true,
  hasCss: true,
  recipeCount: 5,
  themeCount: 2
});
```

**TCMR Detection:**
```typescript
logger.info('TCMR scripts detected', {
  source: 'metadata', // or 'directory-scan'
  scriptCount: 3,
  hasManifest: true
});
```

**Missing Extension:**
```typescript
logger.debug('No GCUI extensions found', {
  checkedPaths: ['/gc/ui/', '/scripts/']
});
```

---

## Future Extensions

Reserved extension IDs:
- `"wasm-modules"` - WebAssembly compute modules
- `"graph-layouts"` - Custom graph visualization configs
- `"i18n"` - Internationalization bundles

---

## References

- [Panda CSS Documentation](https://panda-css.com)
- [Txiki.js Runtime](https://github.com/saghul/txiki.js)
- [GlyphCase Schema v1.1](./SCHEMA.md)
