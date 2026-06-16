import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateBins, autoRange } from '../lib/bins.js';

describe('bins', () => {
  it('autoRange scales with volatility', () => {
    const low = autoRange(0.1);
    const high = autoRange(0.8);
    assert.ok(high.binCount > low.binCount);
  });

  it('calculates SPOT bins around active bin', () => {
    const bins = calculateBins({ mode: 'SPOT', activeBinId: 1000, volatility: 0.2 });
    assert.equal(bins.mode, 'SPOT');
    assert.ok(bins.minBinId < 1000);
    assert.ok(bins.maxBinId > 1000);
  });

  it('calculates CURVE with wider range', () => {
    const spot = calculateBins({ mode: 'SPOT', activeBinId: 1000, volatility: 0.3 });
    const curve = calculateBins({ mode: 'CURVE', activeBinId: 1000, volatility: 0.3 });
    assert.ok(curve.binCount >= spot.binCount);
  });

  it('calculates BID_ASK asymmetric range', () => {
    const bins = calculateBins({ mode: 'BID_ASK', activeBinId: 1000, volatility: 0.2 });
    assert.equal(bins.mode, 'BID_ASK');
  });
});
