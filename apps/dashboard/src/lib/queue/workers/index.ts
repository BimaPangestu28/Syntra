// Worker exports and manager

import { startBuildWorker, stopBuildWorker } from './build.worker';
import { startDeploymentWorker, stopDeploymentWorker } from './deployment.worker';
import { startNotificationWorker, stopNotificationWorker } from './notification.worker';
import { createAlertEvaluationWorker, stopAlertEvaluationWorker } from './alert-evaluation.worker';
import { createAnomalyDetectionWorker } from './anomaly-detection.worker';

let workersStarted = false;

/**
 * Start all queue workers
 * Should be called once when the application starts
 */
export async function startAllWorkers(): Promise<void> {
  if (workersStarted) {
    console.log('[Workers] Workers already started');
    return;
  }

  console.log('[Workers] Starting all workers...');

  try {
    // Start workers in parallel
    await Promise.all([
      startBuildWorker(),
      startDeploymentWorker(),
      startNotificationWorker(),
    ]);

    // Start alert evaluation worker
    createAlertEvaluationWorker();

    // Start anomaly detection worker
    createAnomalyDetectionWorker();

    workersStarted = true;
    console.log('[Workers] All workers started successfully');
  } catch (error) {
    console.error('[Workers] Failed to start workers:', error);
    throw error;
  }
}

/**
 * Stop all queue workers
 * Should be called on graceful shutdown
 */
export async function stopAllWorkers(): Promise<void> {
  if (!workersStarted) {
    console.log('[Workers] Workers not running');
    return;
  }

  console.log('[Workers] Stopping all workers...');

  try {
    // Stop workers
    stopBuildWorker();
    stopDeploymentWorker();
    stopNotificationWorker();
    stopAlertEvaluationWorker();

    workersStarted = false;
    console.log('[Workers] All workers stopped');
  } catch (error) {
    console.error('[Workers] Error stopping workers:', error);
    throw error;
  }
}

/**
 * Check if workers are running
 */
export function areWorkersRunning(): boolean {
  return workersStarted;
}

// Re-export individual workers
export { startBuildWorker, stopBuildWorker } from './build.worker';
export { startDeploymentWorker, stopDeploymentWorker } from './deployment.worker';
export { startNotificationWorker, stopNotificationWorker } from './notification.worker';
export { createAlertEvaluationWorker, stopAlertEvaluationWorker } from './alert-evaluation.worker';
export { createAnomalyDetectionWorker } from './anomaly-detection.worker';
