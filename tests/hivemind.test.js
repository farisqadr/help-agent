import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { publishInsight, getPoolBoost, mergeInsights } from '../lib/hivemind.js';

const STORE = 'tests/fixtures/hivemind-insights.json';

before(async () => { await unlink(STORE).catch(() => {}); });
after(async () => { await unlink(STORE).catch(() => {}); });

describe('hivemind', () => {
  it('publishes and retrieves pool boost', async () => {
    await publishInsight({
      poolAddress: 'PoolXYZ',
      avgPnlSol: 0.12,
      winRate: 0.7,
      sampleSize: 10,
    }, STORE);

    const boost = await getPoolBoost('PoolXYZ', STORE);
    assert.ok(boost > 0);
  });

  it('merges insights from multiple sessions', () => {
    const merged = mergeInsights(
      { poolAddress: 'P', avgPnlSol: 0.1, winRate: 0.6, sampleSize: 5 },
      { poolAddress: 'P', avgPnlSol: 0.2, winRate: 0.8, sampleSize: 5 }
    );
    assert.equal(merged.sampleSize, 10);
    assert.equal(merged.avgPnlSol, 0.15);
    assert.equal(merged.winRate, 0.7);
  });
});
