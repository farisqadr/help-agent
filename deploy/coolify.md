# Coolify Deployment Guide — help.xflow.id

## Infrastructure

```
Cloudflare (proxied) → Coolify v4.1.0 → Traefik 80/443 → help.xflow.id:4321
```

## Coolify App Setup

1. **DNS:** A record `help.xflow.id` → server IP (Cloudflare proxied)
2. **New Application:** Connect GitHub repo `farisqadr/help-agent`, branch `main`
3. **Build Pack:** Dockerfile (path: `./Dockerfile`)
4. **Domain:** `help.xflow.id` → port `4321`
5. **Health Check:** `GET /api/status` (expects HTTP 200)

## Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `HELIUS_RPC_URL` | Yes (live) | Solana mainnet RPC |
| `JUPITER_API_KEY` | Yes (live) | Swap API key |
| `DRY_RUN` | Yes | `true` until validated |
| `WALLET_PRIVATE_KEY` | Yes (live) | From `npm run setup` |
| `LLM_API_URL` | No | OpenAI-compatible endpoint |
| `LLM_API_KEY` | No | Enables LLM ReAct mode |
| `DASHBOARD_USER` | Prod | Basic auth username |
| `DASHBOARD_PASS` | Prod | Basic auth password |

## Persistent Volumes

Mount these paths in Coolify (or use `docker-compose.prod.yml`):

| Container path | Purpose |
|----------------|---------|
| `/app/positions.json` | Open/closed positions |
| `/app/trade-history.json` | Closed trade records |
| `/app/hivemind-insights.json` | Cross-session pool insights |
| `/app/data/zvec` | Pattern memory store |
| `/app/logs` | Screening + decision logs |
| `/app/user-config.json` | Runtime tuning (weights, TP/SL) |

## Production Rollout Checklist

- [ ] Deploy with `DRY_RUN=true`, verify `/api/status` and dashboard
- [ ] Set `DASHBOARD_USER` / `DASHBOARD_PASS`
- [ ] Confirm persistent volumes survive container restart
- [ ] Run one live cycle with minimal SOL (`DRY_RUN=false`)
- [ ] Monitor position → close → swap to SOL
- [ ] Enable auto-deploy on `main` push

## Local Production Test

```bash
docker compose -f docker-compose.prod.yml up --build
curl -s http://localhost:4321/api/status
```
