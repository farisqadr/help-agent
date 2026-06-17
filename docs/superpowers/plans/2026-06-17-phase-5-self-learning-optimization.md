# Phase 5: Self-Learning & Optimization Implementation Plan

> **Status:** Implemented 2026-06-17 in `farisqadr/help-agent`. All MRD TODOs 5.1–5.5 complete. Post-phase: DexScreener enrichment tracked as MRD TODO 2.3.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete Phase 5 (MRD TODOs 5.1, 5.3, 5.4, 5.5) — post-trade PnL analysis, feedback-driven screening/exit tuning, dashboard live charts, and HiveMind cross-agent learning — building on the completed ZVec-style memory integration (TODO 5.2).

**Architecture:** After each position close, `pnl-analysis.js` compares actual vs expected PnL and writes structured records to `trade-history.json`. `feedback-loop.js` reads that history plus pattern memory (`tools/study.js`) to adjust screening score weights and exit thresholds in `user-config.json`. Dashboard exposes `/api/charts/*` WebSocket + REST endpoints consumed by a vanilla JS chart module. `hivemind.js` publishes anonymized pool insights to a shared JSON store (`hivemind-insights.json`) that screening reads at cycle start.

**Tech Stack:** Node.js 22+ ESM, `@meteora-ag/dlmm` v1.9.4, ZVec-style pattern store (`data/zvec/`), Express + WebSocket dashboard, Jupiter API v6, Helius RPC, Node built-in test runner (`node:test` + `node:assert/strict`).

---

## Assumptions & Open Questions

| # | Assumption / Question | Impact if wrong |
|---|------------------------|-----------------|
| A1 | Implementation lives in `farisqadr/help-agent` (consolidated greenfield build). | ~~File paths need remapping from meridian.~~ Resolved. |
| A2 | TODO 5.2 (pattern memory) is done in `tools/study.js` with exports `storeTradePattern(trade)` and `searchSimilarPatterns(query, limit)`. | Task 3 adapted to JSON-backed hybrid search API. |
| A3 | `state.js` already tracks `expectedPnlSol`, `actualPnlSol`, `entryPrice`, `exitPrice`, `poolAddress`, `strategyMode`, `closedAt` per position. | Task 1 extends schema if fields missing. |
| A4 | Screening weights live in `user-config.json` under `screening.weights` (object of factor → number). | Task 3 defines schema if different. |
| Q1 | Should HiveMind insights sync across servers (S3/Redis) or single-server JSON file is sufficient for v1? | Plan uses local JSON; upgrade path noted in Task 8. |
| Q2 | Does `help.xflow.id` proxy to Meridian dashboard (4321) or serve a static landing page from `help-agent`? | Task 7 assumes dashboard is Meridian; Coolify checklist in MRD §3 is separate. |
| Q3 | Which chart library is preferred — Chart.js (CDN) or pure Canvas? | Plan uses Chart.js 4.x via CDN for speed. |

## File Map (Phase 5 — help-agent Engine)

| File | Responsibility |
|------|----------------|
| `lib/pnl-analysis.js` | Compare actual vs expected PnL; classify outcome (beat/miss/neutral) |
| `lib/feedback-loop.js` | Aggregate trade history; compute weight deltas; write config |
| `lib/hivemind.js` | Publish/consume shared pool insights across agent sessions |
| `trade-history.json` | Append-only closed-trade records for analysis |
| `hivemind-insights.json` | Shared pool performance insights (read at screening start) |
| `tests/pnl-analysis.test.js` | Unit tests for PnL analysis |
| `tests/feedback-loop.test.js` | Unit tests for weight adjustment |
| `tests/hivemind.test.js` | Unit tests for insight merge logic |
| `dashboard/routes/charts.js` | REST + WS endpoints for PnL/pool charts |
| `dashboard/public/js/charts.js` | Chart.js rendering for dashboard SPA |
| `state.js` | **Modify** — emit trade record on close |
| `tools/screening.js` | **Modify** — load dynamic weights + HiveMind boosts |
| `index.js` | **Modify** — run feedback loop after close cycle |
| `dashboard/server.js` | **Modify** — mount chart routes |

---

### Task 1: Post-Trade PnL Analysis Module

**Files:**
- Create: `lib/pnl-analysis.js`
- Create: `tests/pnl-analysis.test.js`
- Modify: `state.js` (close handler emits trade record)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/pnl-analysis.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrade, classifyOutcome } from '../lib/pnl-analysis.js';

describe('pnl-analysis', () => {
  it('classifies trade that beat expected PnL', () => {
    const trade = {
      poolAddress: 'Pool111',
      expectedPnlSol: 0.10,
      actualPnlSol: 0.15,
      strategyMode: 'SPOT',
      holdDurationMs: 3600000,
    };
    const result = analyzeTrade(trade);
    assert.equal(result.outcome, 'beat');
    assert.equal(result.deltaSol, 0.05);
    assert.equal(result.deltaPct, 50);
  });

  it('classifies trade within 5% tolerance as neutral', () => {
    const result = classifyOutcome(0.10, 0.102);
    assert.equal(result, 'neutral');
  });

  it('classifies trade below expected as miss', () => {
    const result = classifyOutcome(0.10, 0.05);
    assert.equal(result, 'miss');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/pnl-analysis.test.js`
Expected: FAIL with `Cannot find module '../lib/pnl-analysis.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/pnl-analysis.js
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
  const { readFile, writeFile } = await import('node:fs/promises');
  let history = [];
  try {
    history = JSON.parse(await readFile(historyPath, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  history.push(trade);
  await writeFile(historyPath, JSON.stringify(history, null, 2));
  return trade;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/pnl-analysis.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire close handler in state.js**

In `state.js`, after `closePosition` succeeds and `actualPnlSol` is known, add:

```javascript
import { analyzeTrade, appendTradeHistory } from '../lib/pnl-analysis.js';
import { storeTradePattern } from '../tools/study.js';

// inside closePosition success path:
const analyzed = analyzeTrade({
  poolAddress: position.poolAddress,
  expectedPnlSol: position.expectedPnlSol,
  actualPnlSol: position.actualPnlSol,
  strategyMode: position.strategyMode,
  holdDurationMs: Date.now() - position.openedAt,
  closedAt: new Date().toISOString(),
});
await appendTradeHistory(analyzed);
await storeTradePattern(analyzed);
```

- [ ] **Step 6: Commit**

```bash
git add lib/pnl-analysis.js tests/pnl-analysis.test.js state.js
git commit -m "feat: add post-trade PnL analysis (TODO 5.1)"
```

---

### Task 2: PnL History Reader for Dashboard API

**Files:**
- Create: `lib/trade-history.js`
- Create: `tests/trade-history.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/trade-history.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, unlink } from 'node:fs/promises';
import { getPnlTimeSeries, getPoolPerformance } from '../lib/trade-history.js';

const FIXTURE = 'tests/fixtures/trade-history.json';

before(async () => {
  await writeFile(FIXTURE, JSON.stringify([
    { poolAddress: 'A', actualPnlSol: 0.1, closedAt: '2026-06-15T10:00:00Z', outcome: 'beat' },
    { poolAddress: 'A', actualPnlSol: -0.05, closedAt: '2026-06-16T10:00:00Z', outcome: 'miss' },
    { poolAddress: 'B', actualPnlSol: 0.2, closedAt: '2026-06-16T12:00:00Z', outcome: 'beat' },
  ]));
});

after(async () => {
  await unlink(FIXTURE).catch(() => {});
});

describe('trade-history', () => {
  it('returns cumulative PnL time series', async () => {
    const series = await getPnlTimeSeries(FIXTURE);
    assert.equal(series.length, 3);
    assert.equal(series[2].cumulativePnlSol, 0.25);
  });

  it('aggregates performance per pool', async () => {
    const pools = await getPoolPerformance(FIXTURE);
    const poolA = pools.find((p) => p.poolAddress === 'A');
    assert.equal(poolA.tradeCount, 2);
    assert.equal(poolA.totalPnlSol, 0.05);
    assert.equal(poolA.winRate, 0.5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/trade-history.test.js`
Expected: FAIL with `Cannot find module '../lib/trade-history.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/trade-history.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/trade-history.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/trade-history.js tests/trade-history.test.js tests/fixtures/
git commit -m "feat: add trade history aggregators for dashboard"
```

---

### Task 3: Feedback Loop — Auto-Adjust Screening Weights

**Files:**
- Create: `lib/feedback-loop.js`
- Create: `tests/feedback-loop.test.js`
- Modify: `tools/screening.js` (load weights from config)
- Modify: `index.js` (invoke after management cycle when position closes)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/feedback-loop.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeWeightAdjustments, applyWeightAdjustments } from '../lib/feedback-loop.js';

const DEFAULT_WEIGHTS = {
  volume24h: 0.3,
  feeApr: 0.25,
  volatility: 0.2,
  holderQuality: 0.15,
  binUtilization: 0.1,
};

describe('feedback-loop', () => {
  it('increases weight for factors correlated with beat outcomes', () => {
    const trades = [
      { outcome: 'beat', factors: { volume24h: 0.9, feeApr: 0.5 } },
      { outcome: 'beat', factors: { volume24h: 0.85, feeApr: 0.4 } },
      { outcome: 'miss', factors: { volume24h: 0.2, feeApr: 0.8 } },
    ];
    const deltas = computeWeightAdjustments(trades, DEFAULT_WEIGHTS);
    assert.ok(deltas.volume24h > 0);
    assert.ok(deltas.feeApr <= 0);
  });

  it('clamps weights to sum to 1.0 after apply', () => {
    const adjusted = applyWeightAdjustments(DEFAULT_WEIGHTS, {
      volume24h: 0.1,
      feeApr: -0.05,
      volatility: 0,
      holderQuality: 0,
      binUtilization: 0,
    });
    const sum = Object.values(adjusted).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/feedback-loop.test.js`
Expected: FAIL with `Cannot find module '../lib/feedback-loop.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/feedback-loop.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/feedback-loop.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Wire screening.js to use dynamic weights**

At top of scoring function in `tools/screening.js`:

```javascript
import { readFileSync } from 'node:fs';

function getScreeningWeights() {
  try {
    const config = JSON.parse(readFileSync('user-config.json', 'utf8'));
    return config.screening?.weights ?? DEFAULT_WEIGHTS;
  } catch {
    return DEFAULT_WEIGHTS;
  }
}
```

Replace hardcoded weight usage with `getScreeningWeights()`.

- [ ] **Step 6: Wire index.js feedback invocation**

After management cycle closes a position:

```javascript
import { runFeedbackLoop } from './lib/feedback-loop.js';

// inside runManagementCycle, after close detected:
await runFeedbackLoop();
```

- [ ] **Step 7: Commit**

```bash
git add lib/feedback-loop.js tests/feedback-loop.test.js tools/screening.js index.js
git commit -m "feat: feedback loop auto-adjusts screening weights (TODO 5.3)"
```

---

### Task 4: HiveMind Cross-Agent Learning

**Files:**
- Create: `lib/hivemind.js`
- Create: `tests/hivemind.test.js`
- Modify: `tools/screening.js` (apply HiveMind pool boosts)
- Modify: `index.js` (publish insights after analysis)

- [ ] **Step 1: Write the failing test**

```javascript
// tests/hivemind.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlink } from 'node:fs/promises';
import { publishInsight, getPoolBoost, mergeInsights } from '../lib/hivemind.js';

const STORE = 'tests/fixtures/hivemind-insights.json';

before(async () => { await unlink(STORE).catch(() => {}); });
after(async () => { await unlink(STORE).catch(() => {}); });

describe('hivemind', () => {
  it('publishes and retrieves pool boost', async () => {
    await publishInsight({
      poolAddress: 'PoolXYZ',
      avgPnlSol: 0.12,
      winRate: 0.7,
      sampleSize: 10,
    }, STORE);

    const boost = await getPoolBoost('PoolXYZ', STORE);
    assert.ok(boost > 0);
  });

  it('merges insights from multiple sessions', () => {
    const merged = mergeInsights(
      { poolAddress: 'P', avgPnlSol: 0.1, winRate: 0.6, sampleSize: 5 },
      { poolAddress: 'P', avgPnlSol: 0.2, winRate: 0.8, sampleSize: 5 }
    );
    assert.equal(merged.sampleSize, 10);
    assert.equal(merged.avgPnlSol, 0.15);
    assert.equal(merged.winRate, 0.7);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/hivemind.test.js`
Expected: FAIL with `Cannot find module '../lib/hivemind.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// lib/hivemind.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/hivemind.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Integrate into screening and index.js**

In `tools/screening.js`, after base score computed:

```javascript
import { getPoolBoost } from '../lib/hivemind.js';

// per candidate:
const hiveBoost = await getPoolBoost(candidate.poolAddress);
candidate.score += hiveBoost;
```

In `index.js`, after `appendTradeHistory`:

```javascript
import { publishInsight } from './lib/hivemind.js';

await publishInsight({
  poolAddress: analyzed.poolAddress,
  avgPnlSol: analyzed.actualPnlSol,
  winRate: analyzed.outcome === 'beat' ? 1 : 0,
  sampleSize: 1,
});
```

- [ ] **Step 6: Commit**

```bash
git add lib/hivemind.js tests/hivemind.test.js tools/screening.js index.js
git commit -m "feat: HiveMind cross-agent pool insights (TODO 5.5)"
```

---

### Task 5: Dashboard Chart API Routes

**Files:**
- Create: `dashboard/routes/charts.js`
- Modify: `dashboard/server.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/charts-routes.test.js
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createChartsRouter } from '../dashboard/routes/charts.js';
import http from 'node:http';

let server;
let port;

before(async () => {
  const router = createChartsRouter({ historyPath: 'tests/fixtures/trade-history.json' });
  server = http.createServer(router);
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

describe('charts routes', () => {
  it('GET /api/charts/pnl returns time series', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/charts/pnl`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.series));
  });

  it('GET /api/charts/pools returns pool performance', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/charts/pools`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.pools));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/charts-routes.test.js`
Expected: FAIL with `Cannot find module '../dashboard/routes/charts.js'`

- [ ] **Step 3: Write minimal implementation**

```javascript
// dashboard/routes/charts.js
import { getPnlTimeSeries, getPoolPerformance } from '../../lib/trade-history.js';

export function createChartsRouter({ historyPath = 'trade-history.json' } = {}) {
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/api/charts/pnl') {
      const series = await getPnlTimeSeries(historyPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ series }));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/charts/pools') {
      const pools = await getPoolPerformance(historyPath);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ pools }));
      return;
    }

    res.writeHead(404);
    res.end();
  };
}
```

- [ ] **Step 4: Mount in dashboard/server.js**

```javascript
import { createChartsRouter } from './routes/charts.js';

// after express app created:
app.use(createChartsRouter());
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test tests/charts-routes.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add dashboard/routes/charts.js dashboard/server.js tests/charts-routes.test.js
git commit -m "feat: dashboard chart API endpoints (TODO 5.4 backend)"
```

---

### Task 6: Dashboard Live Charts Frontend

**Files:**
- Create: `dashboard/public/js/charts.js`
- Modify: `dashboard/public/index.html`

- [ ] **Step 1: Add Chart.js CDN and canvas elements to index.html**

```html
<!-- in dashboard/public/index.html, inside <head> -->
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>

<!-- in dashboard body, new section -->
<section id="charts-panel">
  <h2>Performance</h2>
  <canvas id="pnl-chart" height="200"></canvas>
  <canvas id="pool-chart" height="200"></canvas>
</section>
<script type="module" src="/js/charts.js"></script>
```

- [ ] **Step 2: Write charts.js module**

```javascript
// dashboard/public/js/charts.js
async function fetchJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed ${path}: ${res.status}`);
  return res.json();
}

function renderPnlChart(series) {
  const ctx = document.getElementById('pnl-chart');
  new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map((p) => new Date(p.closedAt).toLocaleDateString()),
      datasets: [{
        label: 'Cumulative PnL (SOL)',
        data: series.map((p) => p.cumulativePnlSol),
        borderColor: '#22c55e',
        tension: 0.3,
      }],
    },
    options: { responsive: true },
  });
}

function renderPoolChart(pools) {
  const ctx = document.getElementById('pool-chart');
  const top = [...pools].sort((a, b) => b.totalPnlSol - a.totalPnlSol).slice(0, 10);
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: top.map((p) => p.poolAddress.slice(0, 8) + '…'),
      datasets: [{
        label: 'Total PnL (SOL)',
        data: top.map((p) => p.totalPnlSol),
        backgroundColor: '#3b82f6',
      }],
    },
    options: { responsive: true },
  });
}

async function initCharts() {
  const [{ series }, { pools }] = await Promise.all([
    fetchJson('/api/charts/pnl'),
    fetchJson('/api/charts/pools'),
  ]);
  renderPnlChart(series);
  renderPoolChart(pools);
}

initCharts().catch(console.error);

// WebSocket refresh when new trade closes
const ws = new WebSocket(`ws://${location.host}`);
ws.addEventListener('message', (evt) => {
  const msg = JSON.parse(evt.data);
  if (msg.type === 'trade_closed') initCharts();
});
```

- [ ] **Step 3: Emit WebSocket event on trade close**

In `state.js` close handler, after history append:

```javascript
// if global dashboard WS broadcaster exists:
globalThis.dashboardBroadcast?.({ type: 'trade_closed', poolAddress: analyzed.poolAddress });
```

- [ ] **Step 4: Manual verification**

Run: `DRY_RUN=true node index.js` (separate terminal) and open `http://localhost:4321`
Expected: Two charts render; empty state shows flat line at 0 if no trade history

- [ ] **Step 5: Commit**

```bash
git add dashboard/public/js/charts.js dashboard/public/index.html state.js
git commit -m "feat: dashboard live PnL and pool charts (TODO 5.4)"
```

---

### Task 7: Update MRD Tracker & Integration Test

**Files:**
- Modify: `HELP-MRD.md` (in `help-agent` repo)
- Create: `tests/integration/phase5.test.js` (in `meridian` repo)

- [ ] **Step 1: Write integration test**

```javascript
// tests/integration/phase5.test.js
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTrade } from '../../lib/pnl-analysis.js';
import { computeWeightAdjustments } from '../../lib/feedback-loop.js';
import { mergeInsights } from '../../lib/hivemind.js';

describe('phase5 integration', () => {
  it('full close → analyze → tune → publish pipeline types align', () => {
    const analyzed = analyzeTrade({
      poolAddress: 'P1',
      expectedPnlSol: 0.1,
      actualPnlSol: 0.12,
      strategyMode: 'SPOT',
      holdDurationMs: 1000,
      factors: { volume24h: 0.8, feeApr: 0.6 },
    });
    assert.equal(analyzed.outcome, 'beat');

    const deltas = computeWeightAdjustments(
      [{ outcome: 'beat', factors: { volume24h: 0.8 } }],
      { volume24h: 0.5, feeApr: 0.5 }
    );
    assert.equal(typeof deltas, 'object');

    const merged = mergeInsights(
      { poolAddress: 'P1', avgPnlSol: 0.1, winRate: 0.5, sampleSize: 2 },
      { poolAddress: 'P1', avgPnlSol: 0.12, winRate: 1, sampleSize: 1 }
    );
    assert.equal(merged.sampleSize, 3);
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `node --test tests/`
Expected: All tests PASS

- [x] **Step 3: Update HELP-MRD.md Phase 5 tracker**

Mark TODO 5.1, 5.2, 5.3, 5.4, 5.5 as ✅ DONE with date 2026-06-17.

- [x] **Step 4: Commit**

```bash
git add HELP-MRD.md README.md docs/superpowers/plans/
git commit -m "docs: sync MRD, README, and plans with current state"
```

---

## Self-Review

### 1. Spec Coverage

| MRD Requirement | Plan Task |
|-------------------|-----------|
| TODO 5.1 Post-trade PnL analysis | Task 1 |
| TODO 5.2 Pattern memory (DONE) | Referenced as dependency in Task 1 Step 5 |
| TODO 5.3 Feedback loop → auto-adjust weights | Task 3 |
| TODO 5.4 Dashboard live charts | Tasks 2, 5, 6 |
| TODO 5.5 HiveMind cross-agent learning | Task 4 |
| MRD §3 Deployment checklist | **Gap** — not in Phase 5 scope; track separately in Coolify |
| Phases 1–4 (DONE) | No tasks — already complete per MRD |

### 2. Placeholder Scan

No TBD/TODO/implement-later patterns. All code blocks contain concrete implementations.

### 3. Type Consistency

- `analyzeTrade` output fields (`outcome`, `deltaSol`, `poolAddress`) used consistently in Tasks 3, 4, 6.
- `closedAt` ISO string format used in Tasks 1, 2, 6.
- `screening.weights` schema consistent between Tasks 3 and 5.

---

## Execution Handoff

**Plan implemented 2026-06-17.** Remaining operator work: MRD TODO 6.2 (DNS + Coolify live deploy). For new features, start from HELP-MRD context recovery §5.
