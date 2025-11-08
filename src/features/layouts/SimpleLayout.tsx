/**
 * Simple Layout
 *
 * Minimal chrome, just content
 */

import type { GcuiConfig } from '../../gcui/v1/types';

export interface SimpleLayoutProps {
  config: GcuiConfig;
  title?: string;
  children?: any;
}

export function SimpleLayout({ config, title, children }: SimpleLayoutProps) {
  return (
    <div className="layout-simple">
      <header className="simple-header">
        {config.logo_asset && (
          <img src={config.logo_asset} alt="Logo" className="simple-logo" />
        )}
        {title && <h1>{title}</h1>}
      </header>

      <main className="simple-content">
        {children}
      </main>

      <footer className="simple-footer">
        <p>Powered by GlyphCapsule</p>
      </footer>
    </div>
  );
}
