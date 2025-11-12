/**
 * Error Boundary Component
 *
 * Catches errors in feature components and prevents full app crashes.
 * Each feature panel should be wrapped in its own ErrorBoundary for isolation.
 */

import { Component, ComponentChildren } from 'preact';

interface ErrorBoundaryProps {
  name?: string;  // Name of the feature/component for debugging
  children: ComponentChildren;
  fallback?: (error: Error, reset: () => void) => ComponentChildren;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    const { name = 'Unknown' } = this.props;
    console.error(`[ErrorBoundary:${name}]`, error, errorInfo);

    // Log to envelope if in dynamic mode
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary] Stack:', error.stack);
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    const { hasError, error } = this.state;
    const { children, fallback, name = 'Component' } = this.props;

    if (hasError && error) {
      if (fallback) {
        return fallback(error, this.reset);
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h3>⚠️ {name} Error</h3>
            <p className="error-message">{error.message}</p>
            <button className="btn-secondary" onClick={this.reset}>
              Try Again
            </button>
            {import.meta.env.DEV && (
              <details className="error-details">
                <summary>Error Details (dev only)</summary>
                <pre>{error.stack}</pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Functional wrapper for easier usage
 */
export function withErrorBoundary<P extends object>(
  Component: (props: P) => ComponentChildren,
  name?: string
) {
  return (props: P) => (
    <ErrorBoundary name={name || Component.name}>
      <Component {...props} />
    </ErrorBoundary>
  );
}
