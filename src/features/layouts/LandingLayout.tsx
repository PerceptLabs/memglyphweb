/**
 * Landing Page Layout
 *
 * Hero section, feature grid, CTAs
 */

import type { GcuiConfig } from '../../gcui/v1/types';

export interface LandingLayoutProps {
  config: GcuiConfig;
  children?: any;
}

export function LandingLayout({ config, children }: LandingLayoutProps) {
  return (
    <div className="layout-landing">
      {/* Hero Section */}
      <section className="hero">
        <div className="hero-content">
          {config.logo_asset && (
            <img src={config.logo_asset} alt="Logo" className="hero-logo" />
          )}
          <h1 className="hero-title">
            {config.hero_title || config.site_title || 'Welcome'}
          </h1>
          {config.hero_subtitle && (
            <p className="hero-subtitle">{config.hero_subtitle}</p>
          )}
        </div>
        {config.hero_image && (
          <div
            className="hero-background"
            style={{ backgroundImage: `url(${config.hero_image})` }}
          />
        )}
      </section>

      {/* Main Content */}
      <main className="landing-main">
        {children}
      </main>
    </div>
  );
}
