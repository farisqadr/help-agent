import { readFile, writeFile } from 'node:fs/promises';

const BOOST_SCALE = 0.05;

export function mergeInsights(existing, incoming) {
  const total = existing.sampleSize + incoming.sampleSize;
  return {
    poolAddress: existing.poolAddress,
    avgPnlSol:
      (existing.avgPnlSol * existing.sampleSize + incoming.avgPnlSol * incoming.sampleSize) / total,
    winRate:
      (existing.winRate * existing.sampleSize + incoming.winRate * incoming.sampleSize) / total,
    sampleSize: total,
    updatedAt: new Date().toISOString(),
  };
}

async function loadStore(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    throw err;
  }
}

export async function publishInsight(insight, path = 'hivemind-insights.json') {
  const { mkdir } = await import('node:fs/promises');
  const { dirname } = await import('node:path');
  await mkdir(dirname(path), { recursive: true });
  const store = await loadStore(path);
  const key = insight.poolAddress;
  store[key] = store[key] ? mergeInsights(store[key], insight) : {
    ...insight,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path, JSON.stringify(store, null, 2));
  return store[key];
}

export async function getPoolBoost(poolAddress, path = 'hivemind-insights.json') {
  const store = await loadStore(path);
  const insight = store[poolAddress];
  if (!insight || insight.sampleSize < 3) return 0;
  return Math.min(0.15, insight.winRate * insight.avgPnlSol * BOOST_SCALE);
}
