import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrade, classifyOutcome } from '../lib/pnl-analysis.js';

describe('pnl-analysis', () => {
  it('classifies trade that beat expected PnL', () => {
    const result = analyzeTrade({
      poolAddress: 'Pool111',
      expectedPnlSol: 0.10,
      actualPnlSol: 0.15,
      strategyMode: 'SPOT',
      holdDurationMs: 3600000,
    });
    assert.equal(result.outcome, 'beat');
    assert.ok(Math.abs(result.deltaSol - 0.05) < 0.0001);
    assert.ok(Math.abs(result.deltaPct - 50) < 0.01);
  });

  it('classifies trade within 5% tolerance as neutral', () => {
    assert.equal(classifyOutcome(0.10, 0.102), 'neutral');
  });

  it('classifies trade below expected as miss', () => {
    assert.equal(classifyOutcome(0.10, 0.05), 'miss');
  });
});
