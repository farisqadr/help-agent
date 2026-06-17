import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reloadUserConfig } from '../config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_CONFIG_PATH = resolve(__dirname, '..', 'user-config.json');

// Atomic write: a concurrent reader sees either the old or new complete file,
// never a truncated one (prevents "Unexpected end of JSON input" races).
async function writeJsonAtomic(path, data) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2));
  await rename(tmp, path);
}

const STRATEGY_MODES = ['SPOT', 'CURVE', 'BID_ASK'];

export async function readUserConfig() {
  const raw = await readFile(USER_CONFIG_PATH, 'utf8');
  return JSON.parse(raw);
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeWeights(weights, current) {
  if (!weights || typeof weights !== 'object') return current;
  const merged = { ...current };
  for (const [key, val] of Object.entries(weights)) {
    const n = Number(val);
    if (!Number.isNaN(n) && n >= 0) merged[key] = n;
  }
  const sum = Object.values(merged).reduce((a, b) => a + b, 0);
  if (sum <= 0) return current;
  for (const key of Object.keys(merged)) merged[key] = merged[key] / sum;
  return merged;
}

function sanitizeStringList(list) {
  if (!Array.isArray(list)) return undefined;
  return [...new Set(list.map((s) => String(s).trim()).filter(Boolean))];
}

/**
 * Merge a partial config update onto the persisted config, validating fields,
 * then persist and hot-reload the in-memory config.
 */
export async function updateUserConfig(patch = {}) {
  const current = await readUserConfig();
  const next = structuredClone(current);

  if (patch.screeningIntervalMin != null) {
    next.screeningIntervalMin = clampNumber(patch.screeningIntervalMin, 1, 1440, current.screeningIntervalMin);
  }
  if (patch.managementIntervalMin != null) {
    next.managementIntervalMin = clampNumber(patch.managementIntervalMin, 1, 1440, current.managementIntervalMin);
  }

  if (patch.screening) {
    next.screening = { ...current.screening };
    if (patch.screening.weights) {
      next.screening.weights = sanitizeWeights(patch.screening.weights, current.screening?.weights ?? {});
    }
    if (patch.screening.topCandidatesLimit != null) {
      next.screening.topCandidatesLimit = clampNumber(patch.screening.topCandidatesLimit, 1, 100, current.screening?.topCandidatesLimit ?? 10);
    }
    if (patch.screening.discoverLimit != null) {
      next.screening.discoverLimit = clampNumber(patch.screening.discoverLimit, 1, 500, current.screening?.discoverLimit ?? 50);
    }
    if (patch.screening.poolListUrl != null) {
      next.screening.poolListUrl = String(patch.screening.poolListUrl).trim();
    }
    if (patch.screening.dexscreener) {
      const cur = current.screening?.dexscreener ?? {};
      const d = patch.screening.dexscreener;
      const MAX = 1e15;
      next.screening.dexscreener = {
        enabled: d.enabled != null ? Boolean(d.enabled) : (cur.enabled ?? false),
        minMarketCapUsd: clampNumber(d.minMarketCapUsd ?? cur.minMarketCapUsd ?? 0, 0, MAX, 0),
        maxMarketCapUsd: clampNumber(d.maxMarketCapUsd ?? cur.maxMarketCapUsd ?? 0, 0, MAX, 0),
        minVolume24hUsd: clampNumber(d.minVolume24hUsd ?? cur.minVolume24hUsd ?? 0, 0, MAX, 0),
        minLiquidityUsd: clampNumber(d.minLiquidityUsd ?? cur.minLiquidityUsd ?? 0, 0, MAX, 0),
      };
    }
  }

  if (patch.deploy) {
    next.deploy = { ...current.deploy };
    if (patch.deploy.maxDeployPct != null) {
      next.deploy.maxDeployPct = clampNumber(patch.deploy.maxDeployPct, 0, 1, current.deploy?.maxDeployPct ?? 0.25);
    }
    if (patch.deploy.minSolReserve != null) {
      next.deploy.minSolReserve = clampNumber(patch.deploy.minSolReserve, 0, 1000, current.deploy?.minSolReserve ?? 0.05);
    }
    if (patch.deploy.defaultMode != null && STRATEGY_MODES.includes(patch.deploy.defaultMode)) {
      next.deploy.defaultMode = patch.deploy.defaultMode;
    }
    if (patch.deploy.autoDeploy != null) {
      next.deploy.autoDeploy = Boolean(patch.deploy.autoDeploy);
    }
    if ('autoDeploySol' in patch.deploy) {
      const n = Number(patch.deploy.autoDeploySol);
      next.deploy.autoDeploySol = patch.deploy.autoDeploySol == null || Number.isNaN(n) || n <= 0
        ? null
        : Math.min(n, 100000);
    }
  }

  if (patch.risk) {
    next.risk = { ...current.risk };
    const banned = sanitizeStringList(patch.risk.bannedCategories);
    if (banned) next.risk.bannedCategories = banned;
    const keywords = sanitizeStringList(patch.risk.keywordBlacklist);
    if (keywords) next.risk.keywordBlacklist = keywords;
  }

  if (patch.exit) {
    next.exit = { ...current.exit };
    if (patch.exit.takeProfitPct != null) {
      next.exit.takeProfitPct = clampNumber(patch.exit.takeProfitPct, 0, 10000, current.exit?.takeProfitPct ?? 10);
    }
    if (patch.exit.stopLossPct != null) {
      next.exit.stopLossPct = clampNumber(patch.exit.stopLossPct, 0, 100, current.exit?.stopLossPct ?? 5);
    }
    if (patch.exit.trailingStopPct != null) {
      next.exit.trailingStopPct = clampNumber(patch.exit.trailingStopPct, 0, 100, current.exit?.trailingStopPct ?? 3);
    }
    if (patch.exit.autoSwapToSol != null) {
      next.exit.autoSwapToSol = Boolean(patch.exit.autoSwapToSol);
    }
    if (patch.exit.autoTune != null) {
      next.exit.autoTune = Boolean(patch.exit.autoTune);
    }
  }

  await writeJsonAtomic(USER_CONFIG_PATH, next);
  reloadUserConfig();
  return next;
}
