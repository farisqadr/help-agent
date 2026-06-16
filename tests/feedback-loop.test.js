import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeWeightAdjustments, applyWeightAdjustments } from '../lib/feedback-loop.js';

const DEFAULT_WEIGHTS = {
  volume24h: 0.3,
  feeApr: 0.25,
  volatility: 0.2,
  holderQuality: 0.15,
  binUtilization: 0.1,
};

describe('feedback-loop', () => {
  it('increases weight for factors correlated with beat outcomes', () => {
    const trades = [
      { outcome: 'beat', factors: { volume24h: 0.9, feeApr: 0.5 } },
      { outcome: 'beat', factors: { volume24h: 0.85, feeApr: 0.4 } },
      { outcome: 'miss', factors: { volume24h: 0.2, feeApr: 0.8 } },
      { outcome: 'beat', factors: { volume24h: 0.88, feeApr: 0.45 } },
      { outcome: 'miss', factors: { volume24h: 0.15, feeApr: 0.9 } },
    ];
    const deltas = computeWeightAdjustments(trades, DEFAULT_WEIGHTS);
    assert.ok(deltas.volume24h > 0);
    assert.ok(deltas.feeApr <= 0);
  });

  it('clamps weights to sum to 1.0 after apply', () => {
    const adjusted = applyWeightAdjustments(DEFAULT_WEIGHTS, {
      volume24h: 0.1,
      feeApr: -0.05,
      volatility: 0,
      holderQuality: 0,
      binUtilization: 0,
    });
    const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001);
  });
});
