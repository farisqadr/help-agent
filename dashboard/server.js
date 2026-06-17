import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, isDryRun } from '../config.js';
import { listOpenPositions } from '../state.js';
import { healthCheck } from '../tools/rpc.js';
import { getWalletBalance } from '../lib/wallet-store.js';
import { createChartsRouter } from './routes/charts.js';
import { createControlRouter } from './routes/control.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
let wss = null;

function basicAuth(req, res, next) {
  const user = config.DASHBOARD_USER;
  const pass = config.DASHBOARD_PASS;
  if (!user || !pass) return next();

  const header = req.headers.authorization ?? '';
  const [scheme, encoded] = header.split(' ');
  if (scheme !== 'Basic' || !encoded) {
    res.setHeader('WWW-Authenticate', 'Basic realm="HELP Dashboard"');
    return res.status(401).send('Authentication required');
  }
  const decoded = Buffer.from(encoded, 'base64').toString();
  const [u, p] = decoded.split(':');
  if (u !== user || p !== pass) {
    return res.status(401).send('Invalid credentials');
  }
  return next();
}

export async function startDashboard() {
  const app = express();
  app.use(basicAuth);
  app.use(express.json({ limit: '256kb' }));
  app.use(express.static(resolve(__dirname, 'public')));

  app.get('/api/status', async (_req, res) => {
    const [rpc, balance, positions] = await Promise.all([
      healthCheck(),
      getWalletBalance(),
      listOpenPositions(),
    ]);
    res.json({
      status: 'ok',
      dryRun: isDryRun(),
      rpc,
      balance,
      openPositions: positions.length,
    });
  });

  app.get('/api/positions', async (_req, res) => {
    const positions = await listOpenPositions();
    res.json({ positions });
  });

  app.use(createControlRouter());

  const chartsHandler = createChartsRouter();
  app.use('/api/charts', (req, res) => {
    req.url = req.originalUrl;
    chartsHandler(req, res);
  });

  const server = createServer(app);
  wss = new WebSocketServer({ server });

  globalThis.dashboardBroadcast = (msg) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(data);
    }
  };

  const port = config.DASHBOARD_PORT ?? 4321;
  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`[dashboard] listening on http://localhost:${port}`);
  return server;
}
