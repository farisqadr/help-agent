import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrade } from '../../lib/pnl-analysis.js';
import { computeWeightAdjustments } from '../../lib/feedback-loop.js';
import { mergeInsights } from '../../lib/hivemind.js';

describe('phase5 integration', () => {
  it('full close → analyze → tune → publish pipeline types align', () => {
    const analyzed = analyzeTrade({
      poolAddress: 'P1',
      expectedPnlSol: 0.1,
      actualPnlSol: 0.12,
      strategyMode: 'SPOT',
      holdDurationMs: 1000,
      factors: { volume24h: 0.8, feeApr: 0.6 },
    });
    assert.equal(analyzed.outcome, 'beat');

    const deltas = computeWeightAdjustments(
      [{ outcome: 'beat', factors: { volume24h: 0.8 } }],
      { volume24h: 0.5, feeApr: 0.5 }
    );
    assert.equal(typeof deltas, 'object');

    const merged = mergeInsights(
      { poolAddress: 'P1', avgPnlSol: 0.1, winRate: 0.5, sampleSize: 2 },
      { poolAddress: 'P1', avgPnlSol: 0.12, winRate: 1, sampleSize: 1 }
    );
    assert.equal(merged.sampleSize, 3);
  });
});
