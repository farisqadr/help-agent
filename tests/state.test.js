import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { openPosition, listOpenPositions, closePositionState } from '../state.js';

const POSITIONS = 'positions.json';

before(async () => { await unlink(POSITIONS).catch(() => {}); });
after(async () => { await unlink(POSITIONS).catch(() => {}); });

describe('state', () => {
  it('opens and lists positions', async () => {
    await openPosition({
      positionId: 'test-pos-1',
      poolAddress: 'PoolTest',
      strategyMode: 'SPOT',
      solAmount: 1.0,
      entryPrice: 1.0,
      expectedPnlSol: 0.1,
      binRange: { minBinId: 1, maxBinId: 10 },
    });
    const open = await listOpenPositions();
    assert.equal(open.length, 1);
    assert.equal(open[0].status, 'OPEN');
  });

  it('closes position and writes trade history', async () => {
    const open = await listOpenPositions();
    const pos = open[0];
    await closePositionState(pos.id, { actualPnlSol: 0.12, exitPrice: 1.1 });
    const after = await listOpenPositions();
    assert.equal(after.length, 0);
  });
});
