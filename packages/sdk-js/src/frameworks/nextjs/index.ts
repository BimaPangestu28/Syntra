export { withSyntraMiddleware, type SyntraMiddlewareOptions } from './middleware';
export {
  SyntraErrorBoundary,
  withSyntraErrorBoundary,
  type SyntraErrorBoundaryProps,
} from './error-boundary';

// Re-export main SDK functions for convenience
export {
  init,
  captureException,
  captureMessage,
  setUser,
  setTag,
  setExtra,
  addBreadcrumb,
  startSpan,
  flush,
  close,
} from '../../client';
