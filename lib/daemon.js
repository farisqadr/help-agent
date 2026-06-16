import { config } from '../config.js';
import { runScreeningCycle, runManagementCycle } from './cycles.js';

let screeningTimer = null;
let managementTimer = null;
let startedAt = null;
const lastRun = { screening: null, management: null };
const lastError = { screening: null, management: null };

export function isRunning() {
  return screeningTimer !== null || managementTimer !== null;
}

async function tick(kind, fn) {
  try {
    await fn();
    lastRun[kind] = new Date().toISOString();
    lastError[kind] = null;
  } catch (err) {
    lastError[kind] = err.message;
    console.error(`[daemon] ${kind} error:`, err.message);
  }
}

export function startDaemon({ runImmediately = true } = {}) {
  if (isRunning()) return status();

  const screenMs = (config.screeningIntervalMin ?? 30) * 60 * 1000;
  const mgmtMs = (config.managementIntervalMin ?? 5) * 60 * 1000;

  if (runImmediately) {
    tick('screening', runScreeningCycle);
    tick('management', runManagementCycle);
  }

  screeningTimer = setInterval(() => tick('screening', runScreeningCycle), screenMs);
  managementTimer = setInterval(() => tick('management', runManagementCycle), mgmtMs);
  startedAt = new Date().toISOString();

  console.log(`[daemon] started (screen ${config.screeningIntervalMin}m / manage ${config.managementIntervalMin}m)`);
  return status();
}

export function stopDaemon() {
  if (screeningTimer) clearInterval(screeningTimer);
  if (managementTimer) clearInterval(managementTimer);
  screeningTimer = null;
  managementTimer = null;
  startedAt = null;
  console.log('[daemon] stopped');
  return status();
}

export function status() {
  return {
    running: isRunning(),
    startedAt,
    screeningIntervalMin: config.screeningIntervalMin,
    managementIntervalMin: config.managementIntervalMin,
    lastRun,
    lastError,
  };
}
