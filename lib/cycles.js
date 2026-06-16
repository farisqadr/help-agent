import { isDryRun } from '../config.js';
import { agentLoop } from '../agent.js';
import { listOpenPositions } from '../state.js';

export async function runScreeningCycle() {
  console.log(`[screening] starting cycle (dryRun=${isDryRun()})`);
  return agentLoop('SCREENER', 'Run screening: discover pools, apply risk filters, score candidates, deploy if criteria met.');
}

export async function runManagementCycle() {
  const open = await listOpenPositions();
  if (open.length === 0) {
    console.log('[management] no open positions, skipping');
    return [];
  }
  console.log(`[management] monitoring ${open.length} position(s)`);
  return agentLoop('MANAGER', 'Monitor open positions, evaluate TP/SL/trailing, close and swap to SOL if needed.');
}
