# HELP — Hermes Liquidity Provider

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Solana](https://img.shields.io/badge/Chain-Solana-9945FF)](https://solana.com)
[![Meteora DLMM](https://img.shields.io/badge/DEX-Meteora%20DLMM-00D1FF)](https://meteora.ag)

**Autonomous liquidity provider agent for Meteora DLMM on Solana.**

> **Live:** [help.xflow.id](https://help.xflow.id) · **License:** [MIT](./LICENSE)

---

## Overview

**HELP** (Hermes Liquidity Provider) is an autonomous agent that manages liquidity positions on [Meteora DLMM](https://meteora.ag) (Solana). This repository (`farisqadr/help-agent`) contains the full agent engine, dashboard, deployment configuration, and documentation.

HELP is designed to operate with minimal human intervention while respecting configurable risk boundaries, strategy modes, and safety controls such as dry-run mode.

---

## Features

### Core Lifecycle

HELP follows a continuous four-stage cycle:

```
SCREEN → DEPLOY → MANAGE → CLOSE
```

| Stage | Description | Cadence |
|-------|-------------|---------|
| **SCREEN** | Discover pools, apply risk filters, score candidates | Configurable (`screeningIntervalMin`) |
| **DEPLOY** | Select the best candidate, calculate bins, deploy SOL | After screening when criteria are met |
| **MANAGE** | Monitor open positions; evaluate TP, SL, and trailing stops | Configurable (`managementIntervalMin`) |
| **CLOSE** | Withdraw liquidity and auto-swap proceeds to SOL | On exit signal |

### Strategy Modes

| Mode | Behavior |
|------|----------|
| **SPOT** | Liquidity concentrated around the current price |
| **CURVE** | Wide distribution suited for volatile price ranges |
| **BID-ASK** | Asymmetric distribution for directional bias |

### Risk Filtering

Built-in screening rejects pools in high-risk categories:

- Gambling
- Porn / NSFW
- Prediction markets
- Perpetual DEX
- Binary options
- Lending / borrowing

Additional custom keyword blacklists can be configured via JSON.

### Self-Learning (ZVec Memory)

HELP integrates **ZVec-style** pattern memory (vector + full-text hybrid search) to retain trade patterns across sessions. Trade outcomes feed a feedback loop that auto-adjusts screening weights and HiveMind pool insights.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     HELP Agent (help-agent)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Daemon (index.js)                         │  │
│  │   Cron · Screening · Management · Dashboard            │  │
│  └────────────┬──────────────────────────┬───────────────┘  │
│               │                          │                   │
│        runScreeningCycle          runManagementCycle         │
│               │                          │                   │
│               └────────────┬─────────────┘                   │
│                            ▼                                 │
│                     agentLoop (ReAct)                        │
│               ┌────────────┴────────────┐                    │
│               │                         │                    │
│          LLM (ReAct)            Tool Executor                │
│          SCREENER / MANAGER       dlmm · screening           │
│          / GENERAL                wallet · token · study     │
│               │                         │                    │
│               └────────────┬────────────┘                    │
│                            ▼                                 │
│              ┌─────────────────────────┐                     │
│              │      On-Chain Ops       │                     │
│              │  Helius RPC · Jupiter API │                     │
│              │      Meteora DLMM SDK   │                     │
│              └─────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Layer Summary

| Layer | Component | Description |
|-------|-----------|-------------|
| **Engine** | `index.js`, `agent.js`, `tools/` | Node.js 22+ ESM daemon with LLM-driven ReAct loop |
| **Dashboard** | Express + WebSocket SPA | Real-time status, positions, charts (port `4321`) |
| **Deployment** | Coolify + Traefik | Auto-SSL reverse proxy serving [help.xflow.id](https://help.xflow.id) |

---

## How It Works

### 1. Screening

On each screening cycle, the agent queries Meteora pool data via Helius RPC, applies category and keyword risk filters, scores surviving candidates, and logs decisions. The top candidate is evaluated against deployment criteria.

### 2. Deployment

When a pool passes screening, the agent selects a strategy mode (SPOT, CURVE, or BID-ASK), calculates bin ranges based on volatility, and deploys SOL liquidity through the Meteora DLMM SDK.

### 3. Management

Open positions are monitored on a configurable interval. The evaluator checks take-profit, stop-loss, and trailing-stop conditions. Position state and PnL are tracked in JSON-based state files.

### 4. Close

On an exit signal, the agent withdraws liquidity from the DLMM position and swaps token proceeds back to SOL via Jupiter API v6.

All stages run inside a ReAct loop where an LLM orchestrates tool calls with built-in safety checks and dry-run support.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Runtime** | Node.js 22+ | ESM modules (`"type": "module"`) |
| **DEX SDK** | `@meteora-ag/dlmm` v1.9.4 | Lazy-loaded to avoid CJS errors in dry-run |
| **RPC** | [Helius](https://helius.dev) | Solana mainnet |
| **Swap** | [Jupiter API v6](https://jup.ag) | `quote-api.jup.ag/v6` |
| **LLM** | OpenAI-compatible endpoint | Custom routing endpoint |
| **Vector DB** | ZVec v0.5.0 | Embedded FTS + hybrid vector search |
| **Dashboard** | Express + WebSocket | Vanilla HTML/CSS/JS SPA |
| **Scripts** | Python 3.11 | Watchdog utilities |
| **Deploy** | Coolify v4.1.0 | Traefik proxy with auto-SSL |
| **State** | JSON files | No external database required |

---

## Getting Started

### Prerequisites

- **Node.js 22+** with ESM support
- A **Solana wallet** with SOL for gas and LP capital
- API keys for **Helius** (RPC) and **Jupiter** (swaps)

### Environment Setup

Create a `.env` file (or configure via your deployment platform):

```bash
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
JUPITER_API_KEY=jup_YOUR_KEY
DRY_RUN=true
WALLET_PRIVATE_KEY=YOUR_ENCRYPTED_KEY
```

> **Security:** Never commit `.env` files or raw private keys to version control. Use `npm run setup` to encrypt wallet keys before storing them. Start with `DRY_RUN=true` until you have validated screening and deployment behavior.

### Quick Start

```bash
npm install

# Encrypt wallet keypair (interactive)
npm run setup

# Run a single screening pass (dry run — no on-chain transactions)
DRY_RUN=true node cli.js screen

# Start the full daemon in dry-run mode
DRY_RUN=true npm start

# Check agent status
DRY_RUN=true node cli.js status

# Dashboard (when daemon is running)
curl -s http://localhost:4321/api/status
```

---

## Configuration

### Key Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `HELIUS_RPC_URL` | Yes | Solana mainnet RPC endpoint with API key |
| `JUPITER_API_KEY` | Yes | Jupiter swap API key |
| `DRY_RUN` | Recommended | Set to `true` to simulate without on-chain txs |
| `WALLET_PRIVATE_KEY` | Yes (live) | Encrypted wallet keypair for signing transactions |

### User Config

Runtime behavior (intervals, strategy defaults, risk keywords, TP/SL thresholds) is controlled via `user-config.json`. See [HELP-MRD.md](./HELP-MRD.md) for the full configuration reference.

### Security Best Practices

- Always test with `DRY_RUN=true` before going live
- Encrypt private keys via `setup.js`; never store plaintext keys
- Use a dedicated wallet with limited capital for LP operations
- Restrict dashboard access (port `4321`) to trusted networks
- Rotate API keys periodically

---

## Deployment

HELP is deployed at **[help.xflow.id](https://help.xflow.id)** using the following stack:

```
Cloudflare (DNS + proxy) → Coolify v4.1.0 → Traefik (auto SSL) → help.xflow.id
```

### Coolify Setup (Overview)

1. Point DNS A record for `help.xflow.id` to your server
2. Create a new Coolify app connected to `farisqadr/help-agent`
3. Add `help.xflow.id` as the application domain
4. Configure environment variables in the Coolify UI
5. Coolify auto-builds and deploys on push to `main`
6. Verify SSL and routing at https://help.xflow.id

See [deploy/coolify.md](./deploy/coolify.md) for persistent volumes, health checks, and production hardening.

---

## Documentation

| Document | Description |
|----------|-------------|
| [HELP-MRD.md](./HELP-MRD.md) | Master Reference Document — full system architecture, file map, deployment checklist, and development tracker |
| [Greenfield Master Plan](./docs/superpowers/plans/2026-06-17-help-greenfield-master.md) | Full implementation plan (Phases 0–6) |
| [Phase 5 Plan](./docs/superpowers/plans/2026-06-17-phase-5-self-learning-optimization.md) | Self-learning module detail |

---

## Roadmap

| Phase | Status | Highlights |
|-------|--------|------------|
| **Phase 0 — Bootstrap** | ✅ Complete | Node.js ESM project, config, Dockerfile |
| **Phase 1 — Foundation** | ✅ Complete | RPC, Meteora DLMM SDK, wallet encryption |
| **Phase 2 — Risk Engine & Screener** | ✅ Complete | Risk filters, pool scoring, decision logging |
| **Phase 3 — Entry Execution** | ✅ Complete | SPOT/CURVE/BID-ASK bins, deployPosition, auto-range |
| **Phase 4 — Monitoring & Exit** | ✅ Complete | Position monitor, TP/SL/trailing, close + Jupiter swap |
| **Phase 5 — Self-Learning** | ✅ Complete | PnL analysis, ZVec memory, feedback loop, charts, HiveMind |
| **Phase 6 — Deployment** | 🔄 Operator | Coolify config ready; DNS + live deploy pending |

---

## Contributing

Contributions are welcome. This repository contains the full HELP agent engine, dashboard, tests, and deployment configuration.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-change`)
3. Commit your changes with a clear message
4. Open a pull request against `main`

Please do not include secrets, private keys, or server credentials in pull requests.

---

## License

This project is licensed under the [MIT License](./LICENSE).

---

## Disclaimer

**HELP is experimental software for DeFi liquidity provision. Use at your own risk.**

- Providing liquidity on Solana involves **impermanent loss**, smart contract risk, and token volatility
- Past performance of screening or management strategies does not guarantee future results
- The agent may deploy capital into pools that pass automated filters but still carry significant risk
- Always start in **dry-run mode** and use capital you can afford to lose
- This software is provided **as-is** with no warranties. The authors are not responsible for any financial losses

**Not financial advice.** Do your own research before deploying capital.
