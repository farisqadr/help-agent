import { readFileSync } from 'node:fs';
import { isDryRun } from '../config.js';
import { passesRiskFilter } from './risk.js';
import { getPoolBoost } from '../lib/hivemind.js';

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
    return DRY_POOLS;
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

export async function getTopCandidates(limit = 10) {
  const pools = await discoverPools();
  const rejected = [];
  const candidates = [];

  for (const pool of pools) {
    const risk = passesRiskFilter(pool);
    if (!risk.pass) {
      rejected.push({ poolAddress: pool.poolAddress, reason: risk.reason });
      continue;
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
