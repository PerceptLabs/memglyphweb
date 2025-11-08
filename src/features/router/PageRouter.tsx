/**
 * GCUI Page Router
 *
 * Routes pages based on _ui_pages table and renders with appropriate layouts.
 */

import { useState, useEffect } from 'preact/hooks';
import type { GcuiContext, GcuiPage, LayoutType } from '../../gcui/v1/types';
import { LandingLayout, DocsLayout, DashboardLayout, SimpleLayout } from '../layouts';
import { DashboardRenderer } from '../charts';
import { MarkdownRenderer } from './MarkdownRenderer';

export interface PageRouterProps {
  context: GcuiContext;
}

export function PageRouter({ context }: PageRouterProps) {
  const [currentSlug, setCurrentSlug] = useState<string>('/');

  // Listen for hash changes
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1); // Remove #
      setCurrentSlug(hash || '/');
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial load

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Find current page
  const currentPage = context.pages.find((p) => p.slug === currentSlug) || context.pages[0];

  if (!currentPage) {
    // No pages defined - render 404 or dashboard
    if (context.dashboards.length > 0) {
      return (
        <DashboardLayout config={context.config}>
          <DashboardRenderer dashboards={context.dashboards} />
        </DashboardLayout>
      );
    }

    return (
      <SimpleLayout config={context.config} title="404 Not Found">
        <p>Page not found: {currentSlug}</p>
        <p><a href="#/">Go home</a></p>
      </SimpleLayout>
    );
  }

  // Render page with appropriate layout
  return (
    <PageRenderer
      page={currentPage}
      context={context}
    />
  );
}

interface PageRendererProps {
  page: GcuiPage;
  context: GcuiContext;
}

function PageRenderer({ page, context }: PageRendererProps) {
  const layout = page.layout || 'simple';

  // Render content (markdown)
  const content = page.content ? (
    <MarkdownRenderer content={page.content} />
  ) : (
    <p>No content</p>
  );

  // Choose layout
  switch (layout) {
    case 'landing':
      return (
        <LandingLayout config={context.config}>
          {content}
        </LandingLayout>
      );

    case 'docs':
      return (
        <DocsLayout
          config={context.config}
          navigation={context.navigation}
          currentPage={page}
        >
          {content}
        </DocsLayout>
      );

    case 'dashboard':
      return (
        <DashboardLayout config={context.config}>
          {content}
          {context.dashboards.length > 0 && (
            <DashboardRenderer dashboards={context.dashboards} />
          )}
        </DashboardLayout>
      );

    case 'simple':
    default:
      return (
        <SimpleLayout config={context.config} title={page.title}>
          {content}
        </SimpleLayout>
      );
  }
}
