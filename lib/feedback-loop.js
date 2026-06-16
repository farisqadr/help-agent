const LEARNING_RATE = 0.02;
const MIN_WEIGHT = 0.05;

export function computeWeightAdjustments(trades, currentWeights) {
  if (trades.length < 5) return {};

  const factorKeys = Object.keys(currentWeights);
  const deltas = Object.fromEntries(factorKeys.map((k) => [k, 0]));

  for (const key of factorKeys) {
    const beatAvg = avgFactor(trades, 'beat', key);
    const missAvg = avgFactor(trades, 'miss', key);
    if (beatAvg === null || missAvg === null) continue;
    deltas[key] = (beatAvg - missAvg) * LEARNING_RATE;
  }
  return deltas;
}

function avgFactor(trades, outcome, key) {
  const filtered = trades.filter((t) => t.outcome === outcome && t.factors?.[key] != null);
  if (filtered.length === 0) return null;
  return filtered.reduce((s, t) => s + t.factors[key], 0) / filtered.length;
}

export function applyWeightAdjustments(weights, deltas) {
  const adjusted = { ...weights };
  for (const [key, delta] of Object.entries(deltas)) {
    adjusted[key] = Math.max(MIN_WEIGHT, (adjusted[key] ?? 0) + delta);
  }
  const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
  for (const key of Object.keys(adjusted)) {
    adjusted[key] = adjusted[key] / sum;
  }
  return adjusted;
}

export async function runFeedbackLoop({
  historyPath = 'trade-history.json',
  configPath = 'user-config.json',
} = {}) {
  const { loadTradeHistory } = await import('./trade-history.js');
  const { readFile, writeFile } = await import('node:fs/promises');

  const trades = await loadTradeHistory(historyPath);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  const weights = config.screening?.weights ?? {};
  const deltas = computeWeightAdjustments(trades, weights);
  if (Object.keys(deltas).length === 0) return config;

  config.screening.weights = applyWeightAdjustments(weights, deltas);
  config.screening.lastTunedAt = new Date().toISOString();
  await writeFile(configPath, JSON.stringify(config, null, 2));
  return config;
}
