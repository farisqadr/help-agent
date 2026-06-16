import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { healthCheck } from '../tools/rpc.js';

describe('rpc', () => {
  it('returns dry-run health when no RPC configured', async () => {
    const result = await healthCheck();
    assert.equal(typeof result.ok, 'boolean');
    assert.equal(result.dryRun, true);
  });
});
