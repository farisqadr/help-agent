import { getPnlTimeSeries, getPoolPerformance } from '../../lib/trade-history.js';
import { isDryRun } from '../../config.js';

export function createChartsRouter({ historyPath = 'trade-history.json' } = {}) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    // Show performance for the active network only, so dry-run simulation
    // results don't masquerade as real mainnet performance (and vice versa).
    const mode = { dryRun: isDryRun() };

    if (req.method === 'GET' && url.pathname === '/api/charts/pnl') {
      const series = await getPnlTimeSeries(historyPath, mode);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ series }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/charts/pools') {
      const pools = await getPoolPerformance(historyPath, mode);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pools }));
      return;
    }

    res.writeHead(404);
    res.end();
  };
}
