/**
 * Documentation Layout
 *
 * Sidebar navigation, breadcrumbs, table of contents
 */

import type { GcuiConfig, GcuiNavigation, GcuiPage } from '../../gcui/v1/types';

export interface DocsLayoutProps {
  config: GcuiConfig;
  navigation: GcuiNavigation[];
  currentPage?: GcuiPage;
  children?: any;
}

export function DocsLayout({ config, navigation, currentPage, children }: DocsLayoutProps) {
  // Get sidebar navigation items
  const sidebarItems = navigation.filter((nav) => nav.menu === 'sidebar');

  return (
    <div className="layout-docs">
      {/* Sidebar */}
      <aside className="docs-sidebar">
        <nav className="docs-nav">
          <div className="docs-nav-header">
            {config.logo_asset && (
              <img src={config.logo_asset} alt="Logo" className="docs-logo" />
            )}
            <h3>{config.site_title || 'Documentation'}</h3>
          </div>
          <ul className="docs-nav-list">
            {sidebarItems.map((item) => (
              <li key={item.to_slug} className="docs-nav-item">
                <a
                  href={`#${item.to_slug}`}
                  className={currentPage?.slug === item.to_slug ? 'active' : ''}
                >
                  {item.icon_asset && <img src={item.icon_asset} alt="" className="nav-icon" />}
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="docs-main">
        {currentPage && (
          <div className="docs-breadcrumbs">
            <a href="#/">Home</a>
            {currentPage.category && (
              <>
                <span> / </span>
                <span>{currentPage.category}</span>
              </>
            )}
            <span> / </span>
            <span>{currentPage.title}</span>
          </div>
        )}

        <article className="docs-content">
          {currentPage && <h1>{currentPage.title}</h1>}
          {children}
        </article>
      </main>
    </div>
  );
}
