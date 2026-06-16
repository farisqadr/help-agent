# HELP Agent — Greenfield Master Plan (Implemented)

> **Status:** Implemented 2026-06-17. All code phases (0–5) complete in this repository. Phase 6.2 (live DNS/Coolify deploy) is an operator task.

**Goal:** Build HELP entirely within `farisqadr/help-agent`, deployed at **help.xflow.id**.

## Implementation Summary

| Phase | Status | Key paths |
|-------|--------|-----------|
| 0 Bootstrap | Done | `package.json`, `config.js`, `Dockerfile`, `docker-compose.yml` |
| 1 Foundation | Done | `tools/rpc.js`, `tools/dlmm.js`, `tools/wallet.js`, `setup.js` |
| 2 Screener | Done | `tools/risk.js`, `tools/screening.js`, `lib/logger.js`, `agent.js` |
| 3 Entry | Done | `lib/bins.js`, `state.js`, deploy in `tools/executor.js` |
| 4 Monitor/Exit | Done | `lib/evaluator.js`, close + Jupiter swap, `dashboard/` |
| 5 Self-learning | Done | `lib/pnl-analysis.js`, `lib/feedback-loop.js`, `lib/hivemind.js`, `tools/study.js`, charts |
| 6 Deploy | Config ready | `deploy/coolify.md`, Dockerfile HEALTHCHECK |

## Verify

```bash
npm install
DRY_RUN=true npm test          # 35 tests
DRY_RUN=true node cli.js status
DRY_RUN=true node cli.js screen
```

## Detailed task plans

- [Phase 5 detail](./2026-06-17-phase-5-self-learning-optimization.md)

Full original plan: `.cursor/plans/help_greenfield_dev_plan_9b78404f.plan.md`
