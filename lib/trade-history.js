import { readFile } from 'node:fs/promises';

export async function loadTradeHistory(path = 'trade-history.json') {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

export async function getPnlTimeSeries(path = 'trade-history.json') {
  const trades = await loadTradeHistory(path);
  const sorted = [...trades].sort(
    (a, b) => new Date(a.closedAt) - new Date(b.closedAt)
  );
  let cumulative = 0;
  return sorted.map((t) => {
    cumulative += t.actualPnlSol;
    return {
      closedAt: t.closedAt,
      actualPnlSol: t.actualPnlSol,
      cumulativePnlSol: cumulative,
      outcome: t.outcome,
      poolAddress: t.poolAddress,
    };
  });
}

export async function getPoolPerformance(path = 'trade-history.json') {
  const trades = await loadTradeHistory(path);
  const byPool = new Map();

  for (const t of trades) {
    const entry = byPool.get(t.poolAddress) ?? {
      poolAddress: t.poolAddress,
      tradeCount: 0,
      totalPnlSol: 0,
      wins: 0,
    };
    entry.tradeCount += 1;
    entry.totalPnlSol += t.actualPnlSol;
    if (t.outcome === 'beat') entry.wins += 1;
    byPool.set(t.poolAddress, entry);
  }

  return [...byPool.values()].map((p) => ({
    ...p,
    winRate: p.tradeCount === 0 ? 0 : p.wins / p.tradeCount,
  }));
}
