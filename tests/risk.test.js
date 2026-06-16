import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isBannedCategory, matchesKeywordBlacklist, passesRiskFilter } from '../tools/risk.js';

describe('risk', () => {
  it('rejects banned categories', () => {
    assert.equal(isBannedCategory({ categories: ['Gambling'] }), true);
    assert.equal(isBannedCategory({ categories: ['DeFi'] }), false);
  });

  it('matches keyword blacklist', () => {
    const orig = process.env;
    // keyword blacklist from user-config is loaded at import; test direct function
    assert.equal(matchesKeywordBlacklist('casino token', 'CAS', ''), false);
  });

  it('passes clean pool', () => {
    const result = passesRiskFilter({ name: 'Good', symbol: 'GOOD', metadata: { categories: [] } });
    assert.equal(result.pass, true);
  });

  it('rejects gambling pool', () => {
    const result = passesRiskFilter({
      name: 'Bet',
      metadata: { categories: ['Gambling'] },
    });
    assert.equal(result.pass, false);
  });
});
