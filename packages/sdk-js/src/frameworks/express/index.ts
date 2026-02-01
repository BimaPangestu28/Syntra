export {
  syntraErrorHandler,
  syntraRequestHandler,
  type SyntraErrorHandlerOptions,
} from './error-handler';

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
