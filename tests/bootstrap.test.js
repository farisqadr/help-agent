import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config, isDryRun } from '../config.js';

describe('bootstrap', () => {
  it('loads config with defaults', () => {
    assert.ok(config.screeningIntervalMin);
    assert.ok(config.risk?.bannedCategories?.length > 0);
    assert.equal(typeof isDryRun(), 'boolean');
  });
});
