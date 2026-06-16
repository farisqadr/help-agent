import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'data', 'zvec');
const PATTERNS_FILE = resolve(DATA_DIR, 'patterns.json');

async function loadPatterns() {
  try {
    return JSON.parse(await readFile(PATTERNS_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

async function savePatterns(patterns) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(PATTERNS_FILE, JSON.stringify(patterns, null, 2));
}

function tradeToVector(trade) {
  return [
    trade.actualPnlSol ?? 0,
    trade.expectedPnlSol ?? 0,
    trade.holdDurationMs ?? 0,
    trade.factors?.volume24h ?? 0,
    trade.factors?.feeApr ?? 0,
    trade.factors?.volatility ?? 0,
  ];
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function ftsScore(pattern, query) {
  const text = `${pattern.poolAddress} ${pattern.strategyMode} ${pattern.outcome}`.toLowerCase();
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return 0;
  return terms.filter((t) => text.includes(t)).length / terms.length;
}

export async function storeTradePattern(trade) {
  const patterns = await loadPatterns();
  patterns.push({
    ...trade,
    vector: tradeToVector(trade),
    storedAt: new Date().toISOString(),
  });
  if (patterns.length > 1000) patterns.splice(0, patterns.length - 1000);
  await savePatterns(patterns);
  return trade;
}

export async function searchSimilarPatterns(query, limit = 5) {
  const patterns = await loadPatterns();
  const queryVec = tradeToVector({
    actualPnlSol: 0,
    expectedPnlSol: 0,
    holdDurationMs: 0,
    factors: { volume24h: 0.5, feeApr: 0.5, volatility: 0.5 },
  });

  const scored = patterns.map((p) => {
    const vectorScore = cosineSimilarity(queryVec, p.vector ?? tradeToVector(p));
    const textScore = ftsScore(p, query);
    return { ...p, score: vectorScore * 0.6 + textScore * 0.4 };
  });

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export async function getPatternContext(query = '') {
  const similar = await searchSimilarPatterns(query, 3);
  if (similar.length === 0) return '';
  return similar.map((p) =>
    `Pool ${p.poolAddress?.slice(0, 8)}: ${p.outcome} (PnL ${p.actualPnlSol} SOL, mode ${p.strategyMode})`
  ).join('\n');
}
