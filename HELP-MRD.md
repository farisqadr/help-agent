# 🤖 MRD: HELP (Hermes Liquidity Provider) AI Agent

**Document Purpose:** Master Reference Document (MRD) untuk AI Agent. Dokumen ini adalah *single source of truth* untuk memulihkan konteks development secara cepat. Jika Anda adalah AI Developer yang membaca ini, gunakan status `[TODO]` untuk melacak progres saat ini.

**Project:** HELP (Hermes Liquidity Provider) — Autonomous LP agent for Meteora DLMM on Solana.
# **Public Repo:** `farisqadr/help-agent` → **help.xflow.id** (via Coolify + Traefik)
**Engine:** This repository (consolidated greenfield build)
**Last Updated:** 2026-06-17

---

## 1. PROJECT OVERVIEW

HELP adalah public-facing brand dari autonomous agent yang manage liquidity positions di Meteora DLMM (Solana).

| Layer | Detail |
|-------|--------|
| **Engine** | Node.js 22+ ESM, LLM-driven ReAct loop |
| **Dashboard** | Express + WebSocket SPA, port 4321 |
| **Deployment** | Coolify v4.1.0 → Traefik SSL → help.xflow.id |
| **RPC** | Helius |
| **Swap** | Jupiter API v6 |
| **Memory** | ZVec-style pattern store (`data/zvec/`, vector + FTS hybrid) |
| **Market data** | DexScreener API (optional screening filters + real scoring factors) |

### Core Flow

```
SCREEN → DEPLOY → MANAGE → CLOSE
```

| Function | What It Does | Frequency |
|----------|-------------|-----------|
| **SCREEN** | Discovery + risk filter + DexScreener market data + score pools | Configurable (screeningIntervalMin) |
| **DEPLOY** | Pick best candidate, calculate bins, deploy SOL | After screening if criteria met |
| **MANAGE** | Monitor open positions, TP/SL/trailing checks | Configurable (managementIntervalMin) |
| **CLOSE** | Withdraw liquidity + auto-swap to SOL | On TP/SL/trailing signal |

### Strategy Modes

| Mode | Behavior |
|------|----------|
| **SPOT** | Liquidity concentrated around current price |
| **CURVE** | Wide distribution for volatile ranges |
| **BID-ASK** | Asymmetric distribution for directional bias |

### Risk Filtering (Built-in, Module A)

Auto-reject pools with categories: Gambling, Porn/NSFW, Prediction Market, Perpetual DEX, Binary Option, Lending/Borrowing. Plus custom keyword blacklist (JSON-configurable).

---

## 2. SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────┐
│              index.js + lib/daemon.js                │
│         Cron · Dashboard · Screening · Manage        │
└──────────┬─────────────────────────┬────────────────┘
           │                         │
    runScreeningCycle          runManagementCycle
    (lib/cycles.js)            (lib/cycles.js)
           │                         │
           └──────────┬──────────────┘
                      ▼
                agentLoop(ReAct)
                ┌─────────┴──────────┐
                │                    │
           LLM (ReAct)        Tool Executor
           ┌────┴────┐       ┌──────┴──────────┐
           │SCREENER │       │  dlmm.js        │
           │MANAGER  │       │ screening.js    │
           │GENERAL  │       │ dexscreener.js  │
           └─────────┘       │ wallet.js       │
                              │ token.js        │
                              │ study.js        │
                              └──────┬──────────┘
                                     ▼
                          ┌──────────────────┐
                          │  On-Chain Ops    │
                          │  Helius RPC      │
                          │  Jupiter API     │
                          │  Meteora SDK     │
                          │  DexScreener API │
                          └──────────────────┘
```

### File Map (Engine)

| File | Purpose |
|------|---------|
| `index.js` | Daemon entry — starts dashboard + background cycles |
| `cli.js` | CLI interface — all tools as subcommands |
| `agent.js` | ReAct loop — LLM + tool orchestration |
| `config.js` | Config loader from `user-config.json` |
| `prompt.js` | System prompts per role (SCREENER/MANAGER/GENERAL) |
| `state.js` | Position state machine + PnL tracking |
| `lib/daemon.js` | Cron scheduler for screening/management intervals |
| `lib/cycles.js` | `runScreeningCycle`, `runManagementCycle` |
| `lib/evaluator.js` | TP / SL / trailing-stop evaluation |
| `lib/bins.js` | SPOT / CURVE / BID-ASK bin calculation |
| `lib/pnl-analysis.js` | Post-trade actual vs expected PnL analysis |
| `lib/feedback-loop.js` | Auto-adjust screening weights from trade history |
| `lib/hivemind.js` | Cross-agent pool insight store (`hivemind-insights.json`) |
| `lib/trade-history.js` | Append/read closed trade records |
| `lib/config-store.js` | Patch `user-config.json` (incl. DexScreener filters) |
| `lib/dlmm-sdk.js` | Lazy Meteora SDK loader with ESM interop |
| `tools/definitions.js` | Tool schemas (OpenAI format) |
| `tools/executor.js` | Tool executor + safety checks |
| `tools/dlmm.js` | Meteora DLMM operations (deploy, close, pool info) |
| `tools/screening.js` | Pool discovery, scoring, HiveMind boost |
| `tools/dexscreener.js` | Market cap / volume / liquidity enrichment + filters |
| `tools/meteora-api.js` | Live pool discovery from Meteora datapi |
| `tools/risk.js` | Category + keyword risk filter |
| `tools/wallet.js` | Balances + Jupiter swap |
| `tools/token.js` | Token metadata + holder quality |
| `tools/study.js` | ZVec-style pattern memory (`storeTradePattern`, `searchSimilarPatterns`) |
| `dashboard/` | Express + WebSocket SPA (port 4321) |
| `data/zvec/patterns.json` | Persisted trade pattern vectors |

---

## 3. DEPLOYMENT (help.xflow.id)

### Infrastructure

```
Cloudflare (proxied) → Server
                         → Coolify v4.1.0
                            → Traefik 80/443 (auto SSL)
                               → help.xflow.id
```

### Setup Checklist (Coolify)

- [ ] **DNS:** A record `help.xflow.id` → `IP` (proxied)
- [ ] **Coolify App:** New app → connect `farisqadr/help-agent` repo
- [ ] **Domain:** Add `help.xflow.id` di Coolify app settings
- [ ] **Build:** Coolify auto-build + deploy on push to `main`
- [ ] **Health:** Verify SSL & routing via https://help.xflow.id

### Environment Variables (Coolify UI or `.env`)

```
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx
JUPITER_API_KEY=jup_xxx...
DRY_RUN=true
WALLET_PRIVATE_KEY=xxx  # encrypted via setup.js
```

---

## 4. DEVELOPMENT TRACKER (TODOs)

*AI Developer: Phases 0–5 are code-complete (2026-06-17). Only **TODO 6.2** (operator deploy) remains. Use §5 Context Recovery for session bootstrap.*

### Phase 0: Bootstrap
- [x] **TODO 0.1:** Init Node.js ESM project, package.json, Dockerfile — 2026-06-17

### Phase 1: Foundation
- [x] **TODO 1.1:** Init project environment, RPC connection — 2026-06-17
- [x] **TODO 1.2:** Meteora DLMM SDK integration — 2026-06-17
- [x] **TODO 1.3:** Wallet setup (keypair + encryption via `setup.js`) — 2026-06-17

### Phase 2: Risk Engine & Screener
- [x] **TODO 2.1:** Risk filter — banned categories + keywords — 2026-06-17
- [x] **TODO 2.2:** Screening log + decision log (JSON files) — 2026-06-17
- [x] **TODO 2.3:** DexScreener market data enrichment + configurable filters — 2026-06-17

### Phase 3: Entry Execution
- [x] **TODO 3.1:** SPOT / CURVE / BID_ASK bin calculation — 2026-06-17
- [x] **TODO 3.2:** `deployPosition` via Meteora SDK — 2026-06-17
- [x] **TODO 3.3:** Auto-range calculator based on volatility — 2026-06-17

### Phase 4: Monitoring & Exit
- [x] **TODO 4.1:** Daemon — async position monitor — 2026-06-17
- [x] **TODO 4.2:** Evaluator — TP, SL, Trailing Stop logic — 2026-06-17
- [x] **TODO 4.3:** `closePosition` — withdraw from DLMM — 2026-06-17
- [x] **TODO 4.4:** Auto-swap to SOL (Jupiter API) — 2026-06-17

### Phase 5: Self-Learning & Optimization

- [x] **TODO 5.1** Post-trade PnL analysis — 2026-06-17
- [x] **TODO 5.2** ZVec-style memory integration (`tools/study.js`, `data/zvec/`) — 2026-06-17
- [x] **TODO 5.3** Feedback loop → auto-adjust weights — 2026-06-17
- [x] **TODO 5.4** Dashboard live charts — 2026-06-17
- [x] **TODO 5.5** HiveMind cross-agent learning — 2026-06-17

### Phase 6: Deployment
- [x] **TODO 6.1** Dockerfile + docker-compose + Coolify docs — 2026-06-17
- [ ] **TODO 6.2** DNS + Coolify app live at help.xflow.id (operator task)

---

## 5. CONTEXT RECOVERY PROTOCOL (For AI Agent)

Jika Anda (AI) baru saja di-*reset* atau kehilangan konteks, ikuti prosedur ini sebelum menulis kode:

1. **Acknowledge:** Konfirmasi bahwa Anda telah membaca MRD ini.
2. **Current state (2026-06-17):** Phases 0–5 **code-complete** in this repo. Remaining work is **TODO 6.2** (operator: DNS + Coolify live deploy at help.xflow.id). Recent additions: DexScreener screening (`tools/dexscreener.js`), dashboard market-filter UI, `lib/dlmm-sdk.js` ESM interop loader. Test suite: **72 tests**, all passing (`DRY_RUN=true npm test`).
3. **Locate:** Tanyakan kepada user apakah fokus pada deploy (6.2), hardening, atau fitur baru di luar roadmap.
4. **Review State:** Minta user menempelkan error terakhir atau area kode yang ingin diubah.
5. **Execute:** Lanjutkan dengan mengacu pada blueprint arsitektur di atas dan file structure yang ada.


## 6. TECH STACK REFERENCE

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Runtime** | Node.js 22+ | ESM modules (`"type": "module"`) |
| **DEX SDK** | `@meteora-ag/dlmm` v1.9.4 | Lazy-loaded to avoid CJS error in dry-run |
| **RPC** | Helius | Mainnet |
| **Swap** | Jupiter API v6 | `quote-api.jup.ag/v6` |
| **LLM** | OpenAI-compatible endpoint | Custom endpoint (9router) |
| **Pattern memory** | ZVec-style (`tools/study.js`) | JSON store + cosine similarity + FTS hybrid |
| **Market data** | DexScreener API | Optional screening enrichment (no API key) |
| **Dashboard** | Express + WebSocket | Vanilla HTML/CSS/JS SPA |
| **Scripts** | Python 3.11 | Watchdog scripts (watch-zero, watch-jotchua) |
| **Deploy** | Coolify v4.1.0 | Traefik proxy, auto-SSL |
| **State** | JSON files | No database |

> **Update this document as the project evolves.** When a TODO is completed or a new module added, update the status and push to `main`.
