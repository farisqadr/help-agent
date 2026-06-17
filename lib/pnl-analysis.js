const NEUTRAL_TOLERANCE_PCT = 5;

export function classifyOutcome(expectedSol, actualSol) {
  if (expectedSol === 0) {
    return actualSol > 0 ? 'beat' : actualSol < 0 ? 'miss' : 'neutral';
  }
  const deltaPct = ((actualSol - expectedSol) / Math.abs(expectedSol)) * 100;
  if (Math.abs(deltaPct) <= NEUTRAL_TOLERANCE_PCT) return 'neutral';
  return actualSol > expectedSol ? 'beat' : 'miss';
}

export function analyzeTrade(trade) {
  const { expectedPnlSol, actualPnlSol } = trade;
  const deltaSol = actualPnlSol - expectedPnlSol;
  const deltaPct =
    expectedPnlSol === 0
      ? (actualPnlSol === 0 ? 0 : 100)
      : (deltaSol / Math.abs(expectedPnlSol)) * 100;
  const outcome = classifyOutcome(expectedPnlSol, actualPnlSol);

  return {
    ...trade,
    analyzedAt: new Date().toISOString(),
    outcome,
    deltaSol,
    deltaPct,
  };
}

export async function appendTradeHistory(trade, historyPath = 'trade-history.json') {
  const { readFile, writeFile, rename } = await import('node:fs/promises');
  let history = [];
  try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  history.push(trade);
  const tmp = `${historyPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(history, null, 2));
  await rename(tmp, historyPath);
  return trade;
}
