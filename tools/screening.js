import { readFileSync } from 'node:fs';
import { config, isDryRun } from '../config.js';
import { passesRiskFilter } from './risk.js';
import { getPoolBoost } from '../lib/hivemind.js';
import { discoverPoolsLive } from './meteora-api.js';
import { getHolderQuality } from './token.js';
import { logScreening } from '../lib/logger.js';
import { enrichPoolsWithMarketData, passesMarketFilter, getDexFilters } from './dexscreener.js';

const DEFAULT_WEIGHTS = {
  volume24h: 0.3,
  feeApr: 0.25,
  volatility: 0.2,
  holderQuality: 0.15,
  binUtilization: 0.1,
};

function getScreeningWeights() {
  try {
    const config = JSON.parse(readFileSync('user-config.json', 'utf8'));
    return config.screening?.weights ?? DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

function normalize(value, min, max) {
  if (max === min) return 0.5;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

const DRY_POOLS = [
  {
    poolAddress: 'PoolAAA11111111111111111111111111111111',
    name: 'AAA/SOL',
    symbol: 'AAA',
    volume24h: 2_000_000,
    feeApr: 0.6,
    volatility: 0.12,
    holderQuality: 0.8,
    binUtilization: 0.7,
    metadata: { categories: [] },
    tokenMint: 'MintAAA1111111111111111111111111111111',
  },
  {
    poolAddress: 'PoolBBB11111111111111111111111111111111',
    name: 'BBB/SOL',
    symbol: 'BBB',
    volume24h: 500_000,
    feeApr: 0.3,
    volatility: 0.25,
    holderQuality: 0.5,
    binUtilization: 0.4,
    metadata: { categories: ['Gambling'] },
    tokenMint: 'MintBBB11111111111111111111111111111111',
  },
  {
    poolAddress: 'PoolCCC11111111111111111111111111111111',
    name: 'CCC/SOL',
    symbol: 'CCC',
    volume24h: 1_500_000,
    feeApr: 0.55,
    volatility: 0.18,
    holderQuality: 0.9,
    binUtilization: 0.65,
    metadata: { categories: [] },
    tokenMint: 'MintCCC11111111111111111111111111111111',
  },
];

export async function discoverPools() {
  if (isDryRun()) {
    // Mock enrichment fills marketCap/volume/liquidity for the table + filters
    // without altering the deterministic dry-run scoring factors.
    await enrichPoolsWithMarketData(DRY_POOLS);
    return DRY_POOLS;
  }
  const live = await discoverPoolsLive(config.screening?.discoverLimit ?? 50);
  if (live?.length) {
    // Real holder signal first (when Helius can provide one), then fill the
    // remaining placeholder factors from DexScreener market data.
    await Promise.all(live.map(async (pool) => {
      if (pool.tokenMint && pool.holderQuality === 0.5) {
        try {
          const hq = await getHolderQuality(pool.tokenMint);
          if (hq != null) pool.holderQuality = hq;
        } catch { /* fall back to market-derived proxy */ }
      }
    }));
    await enrichPoolsWithMarketData(live);
    return live;
  }
  return DRY_POOLS;
}

export function scorePool(pool, weights = getScreeningWeights()) {
  const factors = {
    volume24h: normalize(pool.volume24h ?? 0, 0, 5_000_000),
    feeApr: normalize(pool.feeApr ?? 0, 0, 1),
    volatility: 1 - normalize(pool.volatility ?? 0.5, 0, 1),
    holderQuality: pool.holderQuality ?? 0.5,
    binUtilization: pool.binUtilization ?? 0.5,
  };

  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (factors[key] ?? 0) * weight;
  }

  return { score, factors };
}

/**
 * "Screen Now": immediately discover pools, apply risk/banned filters, score,
 * and return top candidates. Does NOT deploy — purely populates the dashboard list.
 */
export async function screenNow(limit = config.screening?.topCandidatesLimit ?? 10) {
  const weights = getScreeningWeights();
  const dexFilters = getDexFilters();
  const pools = await discoverPools();

  const rejected = [];
  const scored = [];

  for (const pool of pools) {
    const risk = passesRiskFilter(pool);
    if (!risk.pass) {
      rejected.push({ poolAddress: pool.poolAddress, name: pool.name, reason: risk.reason });
      continue;
    }
    if (dexFilters.enabled) {
      const market = passesMarketFilter(pool, dexFilters);
      if (!market.pass) {
        rejected.push({ poolAddress: pool.poolAddress, name: pool.name, reason: market.reason });
        continue;
      }
    }
    const { score, factors } = scorePool(pool, weights);
    const hiveBoost = await getPoolBoost(pool.poolAddress).catch(() => 0);
    const total = score + hiveBoost;
    scored.push({ ...pool, score: total, factors, hiveBoost });
  }

  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, limit);
  const timestamp = new Date().toISOString();

  await logScreening({ candidates, rejected, timestamp }).catch(() => {});

  return {
    candidates,
    rejected,
    criteria: { weights },
    discovered: pools.length,
    matched: candidates.length,
    timestamp,
  };
}

export async function getTopCandidates(limit = 10) {
  const dexFilters = getDexFilters();
  const pools = await discoverPools();

  const rejected = [];
  const candidates = [];

  for (const pool of pools) {
    const risk = passesRiskFilter(pool);
    if (!risk.pass) {
      rejected.push({ poolAddress: pool.poolAddress, reason: risk.reason });
      continue;
    }
    if (dexFilters.enabled) {
      const market = passesMarketFilter(pool, dexFilters);
      if (!market.pass) {
        rejected.push({ poolAddress: pool.poolAddress, reason: market.reason });
        continue;
      }
    }
    const { score, factors } = scorePool(pool);
    const hiveBoost = await getPoolBoost(pool.poolAddress).catch(() => 0);
    candidates.push({
      ...pool,
      score: score + hiveBoost,
      factors,
      hiveBoost,
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return {
    candidates: candidates.slice(0, limit),
    rejected,
    timestamp: new Date().toISOString(),
  };
}
