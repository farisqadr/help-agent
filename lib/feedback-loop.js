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

const EXIT_BOUNDS = {
  takeProfitPct: [2, 200],
  stopLossPct: [1, 50],
  trailingStopPct: [0.5, 30],
};

function clamp(value, [min, max]) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Self-learning exit tuning. Uses recent trade outcomes to nudge TP/SL/trailing:
 * - Strong recent performance: let winners run (raise TP, widen trailing).
 * - Weak recent performance: protect capital (tighten SL, lower TP).
 * Adjustments are small (10% relative) and bounded.
 */
export function tuneExitThresholds(trades, currentExit = {}, sampleSize = 10) {
  const recent = trades.slice(-sampleSize);
  if (recent.length < 5) return null;

  const wins = recent.filter((t) => t.outcome === 'beat').length;
  const winRate = wins / recent.length;
  const avgPnl = recent.reduce((s, t) => s + (t.actualPnlSol ?? 0), 0) / recent.length;

  const tp = currentExit.takeProfitPct ?? 10;
  const sl = currentExit.stopLossPct ?? 5;
  const tr = currentExit.trailingStopPct ?? 3;

  let next = { takeProfitPct: tp, stopLossPct: sl, trailingStopPct: tr };

  if (winRate >= 0.6 && avgPnl > 0) {
    next.takeProfitPct = clamp(tp * 1.1, EXIT_BOUNDS.takeProfitPct);
    next.trailingStopPct = clamp(tr * 1.1, EXIT_BOUNDS.trailingStopPct);
  } else if (winRate < 0.4 || avgPnl < 0) {
    next.takeProfitPct = clamp(tp * 0.9, EXIT_BOUNDS.takeProfitPct);
    next.stopLossPct = clamp(sl * 0.9, EXIT_BOUNDS.stopLossPct);
    next.trailingStopPct = clamp(tr * 0.9, EXIT_BOUNDS.trailingStopPct);
  } else {
    return null;
  }

  next.takeProfitPct = Math.round(next.takeProfitPct * 100) / 100;
  next.stopLossPct = Math.round(next.stopLossPct * 100) / 100;
  next.trailingStopPct = Math.round(next.trailingStopPct * 100) / 100;
  return { ...next, winRate, avgPnl };
}

export async function runFeedbackLoop({
  historyPath = 'trade-history.json',
  configPath = 'user-config.json',
} = {}) {
  const { loadTradeHistory } = await import('./trade-history.js');
  const { readFile, writeFile, rename } = await import('node:fs/promises');

  const trades = await loadTradeHistory(historyPath);
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  let changed = false;

  const weights = config.screening?.weights ?? {};
  const deltas = computeWeightAdjustments(trades, weights);
  if (Object.keys(deltas).length > 0) {
    config.screening.weights = applyWeightAdjustments(weights, deltas);
    config.screening.lastTunedAt = new Date().toISOString();
    changed = true;
  }

  if (config.exit?.autoTune) {
    const tuned = tuneExitThresholds(trades, config.exit);
    if (tuned) {
      config.exit.takeProfitPct = tuned.takeProfitPct;
      config.exit.stopLossPct = tuned.stopLossPct;
      config.exit.trailingStopPct = tuned.trailingStopPct;
      config.exit.lastTunedAt = new Date().toISOString();
      changed = true;
    }
  }

  if (changed) {
    const tmp = `${configPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, JSON.stringify(config, null, 2));
    await rename(tmp, configPath);
    const { reloadUserConfig } = await import('../config.js');
    reloadUserConfig();
  }
  return config;
}
