import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getTopCandidates, scorePool } from '../tools/screening.js';

describe('screening', () => {
  it('scores pool with factors', () => {
    const { score, factors } = scorePool({
      volume24h: 1_000_000,
      feeApr: 0.5,
      volatility: 0.2,
      holderQuality: 0.8,
      binUtilization: 0.6,
    });
    assert.ok(score > 0);
    assert.ok(factors.volume24h > 0);
  });

  it('filters gambling pool from candidates', async () => {
    const { candidates, rejected } = await getTopCandidates(10);
    assert.ok(candidates.length > 0);
    assert.ok(rejected.some((r) => r.reason.includes('banned')));
    assert.ok(!candidates.some((c) => c.name === 'BBB/SOL'));
  });
});
