import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBins } from '../lib/bins.js';
import { resolveExitPlan } from '../lib/evaluator.js';

describe('manual bin range', () => {
  it('honors explicit bins below/above active bin', () => {
    const r = calculateBins({
      mode: 'SPOT',
      activeBinId: 1000,
      manualRange: { binsBelow: 5, binsAbove: 8 },
    });
    assert.equal(r.minBinId, 995);
    assert.equal(r.maxBinId, 1008);
    assert.equal(r.binCount, 14);
    assert.equal(r.manual, true);
  });

  it('falls back to auto range without manualRange', () => {
    const r = calculateBins({ mode: 'SPOT', activeBinId: 1000, volatility: 0.2 });
    assert.ok(!r.manual);
    assert.ok(r.minBinId < 1000 && r.maxBinId > 1000);
  });
});

describe('resolveExitPlan', () => {
  it('prefers per-position overrides over global defaults', () => {
    const plan = resolveExitPlan({ exit: { takeProfitPct: 25, autoSwapToSol: false } });
    assert.equal(plan.takeProfitPct, 25);
    assert.equal(plan.autoSwapToSol, false);
    assert.ok(plan.stopLossPct > 0);
  });

  it('falls back to global config when no override', () => {
    const plan = resolveExitPlan({});
    assert.ok(plan.takeProfitPct > 0);
    assert.ok(plan.stopLossPct > 0);
  });
});
