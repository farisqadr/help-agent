import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { tuneExitThresholds } from '../lib/feedback-loop.js';

const baseExit = { takeProfitPct: 10, stopLossPct: 5, trailingStopPct: 3 };

function makeTrades(outcome, pnl, n = 6) {
  return Array.from({ length: n }, () => ({ outcome, actualPnlSol: pnl }));
}

describe('tuneExitThresholds', () => {
  it('returns null with too few trades', () => {
    assert.equal(tuneExitThresholds(makeTrades('beat', 0.1, 3), baseExit), null);
  });

  it('loosens TP/trailing on strong performance', () => {
    const r = tuneExitThresholds(makeTrades('beat', 0.2, 8), baseExit);
    assert.ok(r.takeProfitPct > baseExit.takeProfitPct);
    assert.ok(r.trailingStopPct > baseExit.trailingStopPct);
  });

  it('tightens thresholds on weak performance', () => {
    const r = tuneExitThresholds(makeTrades('miss', -0.2, 8), baseExit);
    assert.ok(r.takeProfitPct < baseExit.takeProfitPct);
    assert.ok(r.stopLossPct < baseExit.stopLossPct);
  });

  it('respects bounds', () => {
    const tiny = { takeProfitPct: 2, stopLossPct: 1, trailingStopPct: 0.5 };
    const r = tuneExitThresholds(makeTrades('miss', -0.2, 8), tiny);
    assert.ok(r.takeProfitPct >= 2);
    assert.ok(r.stopLossPct >= 1);
    assert.ok(r.trailingStopPct >= 0.5);
  });
});
