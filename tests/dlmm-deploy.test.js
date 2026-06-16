import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deployPosition } from '../tools/dlmm.js';
import { calculateBins } from '../lib/bins.js';

describe('dlmm deploy', () => {
  it('deploys position in dry run with bin range', async () => {
    const binRange = calculateBins({ mode: 'SPOT', activeBinId: 1000, volatility: 0.2 });
    const result = await deployPosition({
      poolAddress: 'PoolTest1111111111111111111111111111111',
      solAmount: 1.0,
      mode: 'SPOT',
      binRange,
    });
    assert.equal(result.dryRun, true);
    assert.ok(result.positionId.startsWith('dry-pos-'));
    assert.equal(result.solAmount, 1.0);
  });
});
