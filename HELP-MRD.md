# 🤖 MRD: HELP (Hermes Liquidity Provider) AI Agent

**Document Purpose:** Master Reference Document (MRD) untuk AI Agent. Dokumen ini adalah *single source of truth* untuk memulihkan konteks development secara cepat. Jika Anda adalah AI Developer yang membaca ini, gunakan status `[TODO]` untuk melacak progres saat ini.

**Project:** HELP (Hermes Liquidity Provider) — Autonomous LP agent for Meteora DLMM on Solana.
**Public Repo:** `farisqadr/help-agent` → **help.xflow.id** (via Coolify + Traefik)
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
| **Memory** | ZVec v0.5.0 (vector + FTS hybrid) |

### Core Flow

```
SCREEN → DEPLOY → MANAGE → CLOSE
```

| Function | What It Does | Frequency |
|----------|-------------|-----------|
| **SCREEN** | Discovery + risk filter + score pools | Configurable (screeningIntervalMin) |
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
│                   index.js (Daemon)                  │
│    REPL + Cron + Telegram + PnL Poller + Briefing   │
└──────────┬─────────────────────────┬────────────────┘
           │                         │
    runScreeningCycle          runManagementCycle
           │                         │
           └──────────┬──────────────┘
                      ▼
                agentLoop(ReAct)
                ┌─────────┴──────────┐
                │                    │
           LLM (ReAct)        Tool Executor
           ┌────┴────┐       ┌──────┴──────┐
           │SCREENER │       │  dlmm.js    │
           │MANAGER  │       │ screening.js│
           │GENERAL  │       │ wallet.js   │
           └─────────┘       │ token.js    │
                              │ study.js    │
                              └──────┬──────┘
                                     ▼
                          ┌──────────────────┐
                          │  On-Chain Ops    │
                          │  Helius RPC      │
                          │  Jupiter API     │
                          │  Meteora SDK     │
                          └──────────────────┘
```

### File Map (Engine)

| File | Purpose |
|------|---------|
| `index.js` | Daemon entry — cron, REPL, Telegram, cycles |
| `cli.js` | CLI interface — all tools as subcommands |
| `agent.js` | ReAct loop — LLM + tool orchestration |
| `config.js` | Config loader from `user-config.json` |
| `prompt.js` | System prompts per role (SCREENER/MANAGER/GENERAL) |
| `state.js` | Position state machine + PnL tracking |
| `tools/definitions.js` | 40+ tool schemas (OpenAI format) |
| `tools/executor.js` | Tool executor + safety checks |
| `tools/dlmm.js` | Meteora DLMM SDK wrapper (lazy-load) |
| `tools/screening.js` | Pool discovery + scoring |
| `tools/wallet.js` | Balances + Jupiter swap |
| `tools/token.js` | Token metadata + holders |
| `dashboard/` | Express SPA (port 4321) |

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

*AI Developer: Saat memulai sesi, tanyakan kepada User nomor TODO mana yang saat ini sedang dikerjakan untuk melanjutkan konteks.*

### Phase 0: Bootstrap
- [x] **TODO 0.1:** Init Node.js ESM project, package.json, Dockerfile — 2026-06-17

### Phase 1: Foundation
- [x] **TODO 1.1:** Init project environment, RPC connection — 2026-06-17
- [x] **TODO 1.2:** Meteora DLMM SDK integration — 2026-06-17
- [x] **TODO 1.3:** Wallet setup (keypair + encryption via `setup.js`) — 2026-06-17

### Phase 2: Risk Engine & Screener
- [x] **TODO 2.1:** Risk filter — banned categories + keywords — 2026-06-17
- [x] **TODO 2.2:** Pool scoring + `getTopCandidates` — 2026-06-17
- [x] **TODO 2.3:** Screening log + decision log (JSON files) — 2026-06-17

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
- [x] **TODO 5.2** ZVec memory integration — 2026-06-17
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
2. **Locate:** Tanyakan kepada user: *"Kita sedang di Phase berapa dan TODO nomor berapa?"*
3. **Review State:** Minta user menempelkan kode terakhir yang dikerjakan (atau error terakhir) agar konteks tetap terjaga.
4. **Execute:** Lanjutkan development dengan mengacu pada blueprint arsitektur di atas dan file structure yang ada.


## 6. TECH STACK REFERENCE

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Runtime** | Node.js 22+ | ESM modules (`"type": "module"`) |
| **DEX SDK** | `@meteora-ag/dlmm` v1.9.4 | Lazy-loaded to avoid CJS error in dry-run |
| **RPC** | Helius | Mainnet |
| **Swap** | Jupiter API v6 | `quote-api.jup.ag/v6` |
| **LLM** | OpenAI-compatible endpoint | Custom endpoint (9router) |
| **Vector DB** | ZVec v0.5.0 | Embedded, FTS + hybrid search |
| **Dashboard** | Express + WebSocket | Vanilla HTML/CSS/JS SPA |
| **Scripts** | Python 3.11 | Watchdog scripts (watch-zero, watch-jotchua) |
| **Deploy** | Coolify v4.1.0 | Traefik proxy, auto-SSL |
| **State** | JSON files | No database |

> **Update this document as the project evolves.** When a TODO is completed or a new module added, update the status and push to `main`.
