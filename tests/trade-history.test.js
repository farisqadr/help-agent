import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { getPnlTimeSeries, getPoolPerformance } from '../lib/trade-history.js';

const FIXTURE = 'tests/fixtures/trade-history.json';

before(async () => {
  await writeFile(FIXTURE, JSON.stringify([
    { poolAddress: 'A', actualPnlSol: 0.1, closedAt: '2026-06-15T10:00:00Z', outcome: 'beat' },
    { poolAddress: 'A', actualPnlSol: -0.05, closedAt: '2026-06-16T10:00:00Z', outcome: 'miss' },
    { poolAddress: 'B', actualPnlSol: 0.2, closedAt: '2026-06-16T12:00:00Z', outcome: 'beat' },
  ]));
});

after(async () => { await unlink(FIXTURE).catch(() => {}); });

describe('trade-history', () => {
  it('returns cumulative PnL time series', async () => {
    const series = await getPnlTimeSeries(FIXTURE);
    assert.equal(series.length, 3);
    assert.equal(series[2].cumulativePnlSol, 0.25);
  });

  it('aggregates performance per pool', async () => {
    const pools = await getPoolPerformance(FIXTURE);
    const poolA = pools.find((p) => p.poolAddress === 'A');
    assert.equal(poolA.tradeCount, 2);
    assert.equal(poolA.totalPnlSol, 0.05);
    assert.equal(poolA.winRate, 0.5);
  });
});
