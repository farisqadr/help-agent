import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePosition } from '../lib/evaluator.js';

describe('evaluator', () => {
  const base = { entryPrice: 1.0, peakPnlPct: 0 };

  it('triggers take profit', () => {
    const result = evaluatePosition(base, 1.12);
    assert.equal(result.action, 'close');
    assert.equal(result.reason, 'take_profit');
  });

  it('triggers stop loss', () => {
    const result = evaluatePosition(base, 0.94);
    assert.equal(result.action, 'close');
    assert.equal(result.reason, 'stop_loss');
  });

  it('triggers trailing stop', () => {
    const result = evaluatePosition({ ...base, peakPnlPct: 8 }, 1.04);
    assert.equal(result.action, 'close');
    assert.equal(result.reason, 'trailing_stop');
  });

  it('holds within thresholds', () => {
    const result = evaluatePosition(base, 1.02);
    assert.equal(result.action, 'hold');
  });
});
