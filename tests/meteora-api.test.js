import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('meteora-api', () => {
  it('returns null or array from live discovery', async () => {
    const { discoverPoolsLive } = await import('../tools/meteora-api.js');
    const result = await discoverPoolsLive(5);
    assert.ok(result === null || Array.isArray(result));
  });
});
