import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { passesMarketFilter, getTokenMarketData, deriveMetrics } from '../tools/dexscreener.js';
import { updateUserConfig } from '../lib/config-store.js';

const PATH = resolve('user-config.json');
let original;
before(async () => { original = await readFile(PATH, 'utf8'); });
after(async () => {
  const tmp = `${PATH}.${process.pid}.dexrestore.tmp`;
  await writeFile(tmp, original);
  await rename(tmp, PATH);
});

describe('dexscreener market filter', () => {
  const filters = {
    enabled: true,
    minMarketCapUsd: 1_000_000,
    maxMarketCapUsd: 50_000_000,
    minVolume24hUsd: 250_000,
    minLiquidityUsd: 100_000,
  };

  it('passes a pool that meets all thresholds', () => {
    const pool = { marketCap: 5_000_000, volume24hUsd: 800_000, liquidityUsd: 300_000 };
    assert.equal(passesMarketFilter(pool, filters).pass, true);
  });

  it('rejects below min marketcap', () => {
    const r = passesMarketFilter({ marketCap: 500_000, volume24hUsd: 800_000, liquidityUsd: 300_000 }, filters);
    assert.equal(r.pass, false);
    assert.match(r.reason, /marketcap below/);
  });

  it('rejects above max marketcap', () => {
    const r = passesMarketFilter({ marketCap: 99_000_000, volume24hUsd: 800_000, liquidityUsd: 300_000 }, filters);
    assert.equal(r.pass, false);
    assert.match(r.reason, /marketcap above/);
  });

  it('rejects below min volume', () => {
    const r = passesMarketFilter({ marketCap: 5_000_000, volume24hUsd: 100_000, liquidityUsd: 300_000 }, filters);
    assert.equal(r.pass, false);
    assert.match(r.reason, /volume below/);
  });

  it('rejects below min liquidity', () => {
    const r = passesMarketFilter({ marketCap: 5_000_000, volume24hUsd: 800_000, liquidityUsd: 50_000 }, filters);
    assert.equal(r.pass, false);
    assert.match(r.reason, /liquidity below/);
  });

  it('does not block pools when market data is missing', () => {
    const r = passesMarketFilter({ marketDataMissing: true }, filters);
    assert.equal(r.pass, true);
  });

  it('treats 0 thresholds as ignored', () => {
    const open = { enabled: true, minMarketCapUsd: 0, maxMarketCapUsd: 0, minVolume24hUsd: 0, minLiquidityUsd: 0 };
    assert.equal(passesMarketFilter({ marketCap: 1, volume24hUsd: 1, liquidityUsd: 1 }, open).pass, true);
  });

  it('returns deterministic mock data in dry-run', async () => {
    const data = await getTokenMarketData(['MintAAA', 'MintBBB']);
    assert.ok(data.MintAAA.marketCap > 0);
    assert.ok(data.MintBBB.volume24h > 0);
  });
});

describe('dexscreener deriveMetrics (real factors)', () => {
  it('maps a big price swing to high volatility', () => {
    assert.equal(deriveMetrics({ priceChange24h: -45 }).volatility, 1);
    assert.ok(deriveMetrics({ priceChange24h: 3 }).volatility < 0.2);
  });

  it('derives capital utilization from turnover', () => {
    const high = deriveMetrics({ liquidity: 100_000, volume24h: 900_000 });
    assert.equal(high.binUtilization, 1);
    const low = deriveMetrics({ liquidity: 100_000, volume24h: 30_000 });
    assert.ok(low.binUtilization < 0.2);
  });

  it('derives holder quality from liquidity + activity', () => {
    const strong = deriveMetrics({ liquidity: 2_000_000, txns24h: 1800 });
    assert.ok(strong.holderQuality > 0.9);
    const weak = deriveMetrics({ liquidity: 50_000, txns24h: 5 });
    assert.ok(weak.holderQuality < 0.15);
  });

  it('returns null factors when the underlying data is absent', () => {
    const m = deriveMetrics({});
    assert.equal(m.volatility, null);
    assert.equal(m.binUtilization, null);
    assert.equal(m.holderQuality, null);
  });
});

describe('config-store dexscreener', () => {
  it('persists and clamps dexscreener filters', async () => {
    const next = await updateUserConfig({
      screening: { dexscreener: { enabled: true, minMarketCapUsd: 2_000_000, minVolume24hUsd: -5 } },
    });
    assert.equal(next.screening.dexscreener.enabled, true);
    assert.equal(next.screening.dexscreener.minMarketCapUsd, 2_000_000);
    assert.equal(next.screening.dexscreener.minVolume24hUsd, 0);
  });
});
