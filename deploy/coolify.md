# Coolify deployment configuration for help.xflow.id
# See HELP-MRD.md §3 for full setup checklist

# Required environment variables (set in Coolify UI):
# HELIUS_RPC_URL, JUPITER_API_KEY, DRY_RUN, WALLET_PRIVATE_KEY
# LLM_API_URL, LLM_API_KEY (optional — deterministic mode without LLM)
# DASHBOARD_USER, DASHBOARD_PASS (recommended for production)

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:4321/api/status || exit 1

# Persistent volumes (configure in Coolify):
# /app/positions.json
# /app/trade-history.json
# /app/hivemind-insights.json
# /app/data/zvec
# /app/logs
# /app/user-config.json
