import { getPnlTimeSeries, getPoolPerformance } from '../../lib/trade-history.js';

export function createChartsRouter({ historyPath = 'trade-history.json' } = {}) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/charts/pnl') {
      const series = await getPnlTimeSeries(historyPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ series }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/charts/pools') {
      const pools = await getPoolPerformance(historyPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pools }));
      return;
    }

    res.writeHead(404);
    res.end();
  };
}
