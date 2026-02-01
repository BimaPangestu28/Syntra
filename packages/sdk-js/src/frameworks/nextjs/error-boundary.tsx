import * as React from 'react';
import { captureException, addBreadcrumb } from '../../client';

/**
 * Props for SyntraErrorBoundary
 */
export interface SyntraErrorBoundaryProps {
  children: React.ReactNode;
  /** Fallback UI to show when an error occurs */
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode);
  /** Called when an error is captured */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Additional tags to add to the error */
  tags?: Record<string, string>;
  /** Component name for better error grouping */
  componentName?: string;
}

interface SyntraErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that captures React errors and reports them to Syntra
 *
 * @example
 * ```tsx
 * import { SyntraErrorBoundary } from '@syntra/sdk/nextjs';
 *
 * export default function Layout({ children }) {
 *   return (
 *     <SyntraErrorBoundary
 *       fallback={<div>Something went wrong</div>}
 *       componentName="MainLayout"
 *     >
 *       {children}
 *     </SyntraErrorBoundary>
 *   );
 * }
 * ```
 */
export class SyntraErrorBoundary extends React.Component<
  SyntraErrorBoundaryProps,
  SyntraErrorBoundaryState
> {
  constructor(props: SyntraErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): SyntraErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    const { onError, tags, componentName } = this.props;

    // Add breadcrumb
    addBreadcrumb({
      type: 'error',
      category: 'react.error-boundary',
      message: `Error caught in ${componentName ?? 'ErrorBoundary'}`,
      data: {
        componentStack: errorInfo.componentStack,
      },
      level: 'error',
    });

    // Capture the error
    captureException(error, {
      tags: {
        ...tags,
        'react.component': componentName ?? 'unknown',
        'react.error_boundary': 'true',
      },
      extra: {
        componentStack: errorInfo.componentStack,
      },
    });

    // Call custom onError handler
    if (onError) {
      onError(error, errorInfo);
    }
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError && error) {
      if (typeof fallback === 'function') {
        return fallback(error, this.reset);
      }
      if (fallback) {
        return fallback;
      }
      return null;
    }

    return children;
  }
}

/**
 * HOC to wrap a component with Syntra error boundary
 *
 * @example
 * ```tsx
 * import { withSyntraErrorBoundary } from '@syntra/sdk/nextjs';
 *
 * function MyComponent() {
 *   return <div>...</div>;
 * }
 *
 * export default withSyntraErrorBoundary(MyComponent, {
 *   componentName: 'MyComponent',
 *   fallback: <div>Error loading component</div>,
 * });
 * ```
 */
export function withSyntraErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<SyntraErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName = Component.displayName || Component.name || 'Component';

  const WrappedComponent: React.FC<P> = (props) => (
    <SyntraErrorBoundary
      componentName={displayName}
      {...options}
    >
      <Component {...props} />
    </SyntraErrorBoundary>
  );

  WrappedComponent.displayName = `withSyntraErrorBoundary(${displayName})`;

  return WrappedComponent;
}
