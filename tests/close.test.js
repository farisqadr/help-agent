import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';

const POSITIONS = 'positions.close-test.json';
process.env.POSITIONS_PATH = POSITIONS;
const { executeTool } = await import('../tools/executor.js');
const { listOpenPositions } = await import('../state.js');

before(async () => { await unlink(POSITIONS).catch(() => {}); });
after(async () => { await unlink(POSITIONS).catch(() => {}); });

describe('close flow', () => {
  it('deploys then closes position in dry run', async () => {
    const deployed = await executeTool('deployPosition', {
      poolAddress: 'PoolClose1111111111111111111111111111111',
      solAmount: 0.5,
      mode: 'SPOT',
      volatility: 0.15,
    });
    assert.ok(deployed.position);

    const open = await listOpenPositions();
    assert.equal(open.length, 1);

    const closed = await executeTool('closePosition', {
      positionId: deployed.position.id,
      poolAddress: deployed.position.poolAddress,
      reason: 'test_close',
    });
    assert.ok(closed.actualPnlSol != null);
    assert.equal((await listOpenPositions()).length, 0);
  });
});
