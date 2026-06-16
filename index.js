import { config, isDryRun } from './config.js';
import { agentLoop } from './agent.js';
import { startDashboard } from './dashboard/server.js';
import { listOpenPositions } from './state.js';

let screeningTimer = null;
let managementTimer = null;

export async function runScreeningCycle() {
  console.log(`[screening] starting cycle (dryRun=${isDryRun()})`);
  await agentLoop('SCREENER', 'Run screening: discover pools, apply risk filters, score candidates, deploy if criteria met.');
}

export async function runManagementCycle() {
  const open = await listOpenPositions();
  if (open.length === 0) {
    console.log('[management] no open positions, skipping');
    return;
  }
  console.log(`[management] monitoring ${open.length} position(s)`);
  await agentLoop('MANAGER', 'Monitor open positions, evaluate TP/SL/trailing, close and swap to SOL if needed.');
}

function scheduleCycles() {
  const screenMs = (config.screeningIntervalMin ?? 30) * 60 * 1000;
  const mgmtMs = (config.managementIntervalMin ?? 5) * 60 * 1000;

  screeningTimer = setInterval(() => {
    runScreeningCycle().catch((err) => console.error('[screening] error:', err));
  }, screenMs);

  managementTimer = setInterval(() => {
    runManagementCycle().catch((err) => console.error('[management] error:', err));
  }, mgmtMs);
}

async function main() {
  console.log(`HELP Agent daemon starting (dryRun=${isDryRun()})`);
  await startDashboard();

  await runScreeningCycle().catch((err) => console.error('[screening] initial error:', err));
  await runManagementCycle().catch((err) => console.error('[management] initial error:', err));
  scheduleCycles();

  process.on('SIGINT', () => {
    clearInterval(screeningTimer);
    clearInterval(managementTimer);
    process.exit(0);
  });
}

import { pathToFileURL } from 'node:url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
