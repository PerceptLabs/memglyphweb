/**
 * Dashboard Layout
 *
 * Widget grid for data visualizations
 */

import type { GcuiConfig } from '../../gcui/v1/types';

export interface DashboardLayoutProps {
  config: GcuiConfig;
  children?: any;
}

export function DashboardLayout({ config, children }: DashboardLayoutProps) {
  return (
    <div className="layout-dashboard">
      <header className="dashboard-header">
        <h1>{config.site_title || 'Dashboard'}</h1>
      </header>

      <main className="dashboard-content">
        {children}
      </main>
    </div>
  );
}
