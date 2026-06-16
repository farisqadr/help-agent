import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getPoolInfo, getActiveBin } from '../tools/dlmm.js';

describe('dlmm', () => {
  it('returns fixture pool info in dry run', async () => {
    const info = await getPoolInfo('TestPool');
    assert.ok(info.poolAddress);
    assert.ok(info.currentPrice > 0);
  });

  it('returns active bin in dry run', async () => {
    const bin = await getActiveBin('TestPool');
    assert.ok(bin.binId);
    assert.ok(bin.price > 0);
  });
});
