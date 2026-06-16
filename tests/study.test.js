import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { storeTradePattern, searchSimilarPatterns } from '../tools/study.js';

const PATTERNS = 'data/zvec/patterns.json';

before(async () => {
  await unlink(PATTERNS).catch(() => {});
});

after(async () => {
  await unlink(PATTERNS).catch(() => {});
});

describe('study', () => {
  it('stores and searches trade patterns', async () => {
    await storeTradePattern({
      poolAddress: 'PoolTest123',
      outcome: 'beat',
      actualPnlSol: 0.15,
      strategyMode: 'SPOT',
      factors: { volume24h: 0.8 },
    });
    const results = await searchSimilarPatterns('PoolTest beat', 5);
    assert.ok(results.length >= 1);
  });
});
