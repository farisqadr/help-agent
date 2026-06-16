#!/usr/bin/env node
import { config, isDryRun } from './config.js';
import { runScreeningCycle, runManagementCycle } from './lib/cycles.js';
import { healthCheck } from './tools/rpc.js';
import { getSolBalance } from './tools/wallet.js';
import { listOpenPositions } from './state.js';

const args = process.argv.slice(2);
const command = args[0];
const flags = new Set(args.slice(1));

if (flags.has('--dry-run')) {
  process.env.DRY_RUN = 'true';
}

async function status() {
  const dryRun = isDryRun();
  const rpc = await healthCheck();
  const balance = await getSolBalance();
  const positions = await listOpenPositions();
  console.log(JSON.stringify({
    status: 'ok',
    dryRun,
    rpc,
    balance,
    openPositions: positions.length,
    screeningIntervalMin: config.screeningIntervalMin,
    managementIntervalMin: config.managementIntervalMin,
  }, null, 2));
}

async function main() {
  switch (command) {
    case 'screen':
      await runScreeningCycle();
      break;
    case 'manage':
      await runManagementCycle();
      break;
    case 'status':
      await status();
      break;
    default:
      console.log(`HELP Agent CLI

Usage:
  node cli.js screen [--dry-run]   Run one screening cycle
  node cli.js manage [--dry-run]   Run one management cycle
  node cli.js status               Show agent status
`);
      process.exit(command ? 1 : 0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
