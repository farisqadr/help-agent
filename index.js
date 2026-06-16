import { isDryRun } from './config.js';
import { startDashboard } from './dashboard/server.js';
import { startDaemon, stopDaemon } from './lib/daemon.js';

export { runScreeningCycle, runManagementCycle } from './lib/cycles.js';

async function main() {
  console.log(`HELP Agent daemon starting (dryRun=${isDryRun()})`);
  await startDashboard();
  startDaemon({ runImmediately: true });

  process.on('SIGINT', () => {
    stopDaemon();
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
