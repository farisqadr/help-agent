import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createChartsRouter } from '../dashboard/routes/charts.js';
import http from 'node:http';
import { writeFile, unlink, mkdir } from 'node:fs/promises';

const FIXTURE = 'tests/fixtures/trade-history-charts.json';
let server;
let port;

before(async () => {
  await mkdir('tests/fixtures', { recursive: true });
  await writeFile(FIXTURE, JSON.stringify([
    { poolAddress: 'A', actualPnlSol: 0.1, closedAt: '2026-06-15T10:00:00Z', outcome: 'beat' },
  ]));
  const router = createChartsRouter({ historyPath: FIXTURE });
  server = http.createServer(router);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await unlink(FIXTURE).catch(() => {});
});

describe('charts routes', () => {
  it('GET /api/charts/pnl returns time series', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/charts/pnl`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.series));
  });

  it('GET /api/charts/pools returns pool performance', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/charts/pools`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.pools));
  });
});
