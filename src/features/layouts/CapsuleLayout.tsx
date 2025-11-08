/**
 * Capsule Layout Component
 *
 * Main layout for browsing an opened capsule with search, filters, and preview panels.
 */

import type { ReactNode } from 'preact/compat';

export interface CapsuleLayoutProps {
  topBar: ReactNode;
  leftSidebar?: ReactNode;
  centerPanel: ReactNode;
  rightSidebar?: ReactNode;
  showLeftSidebar?: boolean;
  showRightSidebar?: boolean;
}

export function CapsuleLayout({
  topBar,
  leftSidebar,
  centerPanel,
  rightSidebar,
  showLeftSidebar = true,
  showRightSidebar = false,
}: CapsuleLayoutProps) {
  return (
    <div className="capsule-layout">
      {/* Top Bar */}
      <div className="capsule-topbar">{topBar}</div>

      {/* Main Content Area */}
      <div className="capsule-content">
        {/* Left Sidebar - Filters */}
        {showLeftSidebar && leftSidebar && (
          <aside className="capsule-sidebar capsule-sidebar-left">
            {leftSidebar}
          </aside>
        )}

        {/* Center Panel - Results/Preview */}
        <main className="capsule-main">{centerPanel}</main>

        {/* Right Sidebar - Metadata/Details */}
        {showRightSidebar && rightSidebar && (
          <aside className="capsule-sidebar capsule-sidebar-right">
            {rightSidebar}
          </aside>
        )}
      </div>
    </div>
  );
}

export interface TopBarProps {
  capsuleName: string;
  onClose?: () => void;
  actions?: ReactNode;
}

export function TopBar({ capsuleName, onClose, actions }: TopBarProps) {
  return (
    <div className="topbar-content">
      <div className="topbar-left">
        <h2 className="topbar-title">
          📦 {capsuleName}
        </h2>
      </div>
      <div className="topbar-right">
        {actions}
        {onClose && (
          <button className="btn-secondary btn-sm" onClick={onClose}>
            Close Capsule
          </button>
        )}
      </div>
    </div>
  );
}

export interface FilterPanelProps {
  title: string;
  children: ReactNode;
  onClear?: () => void;
  hasActiveFilters?: boolean;
}

export function FilterPanel({
  title,
  children,
  onClear,
  hasActiveFilters = false,
}: FilterPanelProps) {
  return (
    <div className="filter-panel">
      <div className="filter-panel-header">
        <h3>{title}</h3>
        {hasActiveFilters && onClear && (
          <button className="btn-link btn-sm" onClick={onClear}>
            Clear All
          </button>
        )}
      </div>
      <div className="filter-panel-content">{children}</div>
    </div>
  );
}
