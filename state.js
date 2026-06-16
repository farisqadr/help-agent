import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const POSITIONS_PATH = resolve(__dirname, 'positions.json');

async function loadPositions() {
  try {
    const data = await readFile(POSITIONS_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function savePositions(positions) {
  await writeFile(POSITIONS_PATH, JSON.stringify(positions, null, 2));
}

export async function listOpenPositions() {
  const all = await loadPositions();
  return all.filter((p) => p.status === 'OPEN');
}

export async function getPosition(positionId) {
  const all = await loadPositions();
  return all.find((p) => p.id === positionId);
}

export async function openPosition(data) {
  const all = await loadPositions();
  const position = {
    id: data.positionId ?? `pos-${Date.now()}`,
    poolAddress: data.poolAddress,
    strategyMode: data.strategyMode ?? 'SPOT',
    solDeployed: data.solAmount,
    entryPrice: data.entryPrice,
    expectedPnlSol: data.expectedPnlSol ?? 0,
    actualPnlSol: null,
    peakPnlPct: 0,
    binRange: data.binRange,
    factors: data.factors ?? {},
    status: 'OPEN',
    openedAt: Date.now(),
    closedAt: null,
  };
  all.push(position);
  await savePositions(all);
  return position;
}

export async function updatePosition(positionId, updates) {
  const all = await loadPositions();
  const idx = all.findIndex((p) => p.id === positionId);
  if (idx === -1) throw new Error(`Position not found: ${positionId}`);
  all[idx] = { ...all[idx], ...updates };
  await savePositions(all);
  return all[idx];
}

export async function closePositionState(positionId, { actualPnlSol, exitPrice }) {
  const all = await loadPositions();
  const idx = all.findIndex((p) => p.id === positionId);
  if (idx === -1) throw new Error(`Position not found: ${positionId}`);
  all[idx] = {
    ...all[idx],
    status: 'CLOSED',
    actualPnlSol,
    exitPrice,
    closedAt: Date.now(),
  };
  await savePositions(all);
  const closed = all[idx];

  const { analyzeTrade, appendTradeHistory } = await import('./lib/pnl-analysis.js');
  const analyzed = analyzeTrade({
    poolAddress: closed.poolAddress,
    expectedPnlSol: closed.expectedPnlSol,
    actualPnlSol: closed.actualPnlSol,
    strategyMode: closed.strategyMode,
    holdDurationMs: closed.closedAt - closed.openedAt,
    closedAt: new Date(closed.closedAt).toISOString(),
    factors: closed.factors,
  });
  await appendTradeHistory(analyzed);

  try {
    const { storeTradePattern } = await import('./study.js');
    await storeTradePattern(analyzed);
  } catch { /* study optional at bootstrap */ }

  try {
    const { publishInsight } = await import('./lib/hivemind.js');
    await publishInsight({
      poolAddress: analyzed.poolAddress,
      avgPnlSol: analyzed.actualPnlSol,
      winRate: analyzed.outcome === 'beat' ? 1 : 0,
      sampleSize: 1,
    });
  } catch { /* hivemind optional */ }

  globalThis.dashboardBroadcast?.({
    type: 'trade_closed',
    poolAddress: analyzed.poolAddress,
  });

  return closed;
}

export function computePnlPct(position, currentPrice) {
  if (!position.entryPrice) return 0;
  return ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
}
