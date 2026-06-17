import { isDryRun, config } from '../config.js';

const DEX_TOKENS_URL = 'https://api.dexscreener.com/latest/dex/tokens';
const SOL_CHAIN = 'solana';

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function pickBestPair(pairs, mint) {
  const relevant = pairs.filter(
    (p) => p.chainId === SOL_CHAIN &&
      (p.baseToken?.address === mint || p.quoteToken?.address === mint)
  );
  if (relevant.length === 0) return null;
  return relevant.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
}

// Deterministic pseudo market data so dry-run/tests are stable and offline.
function mockData(mint) {
  let h = 0;
  for (const ch of mint) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return {
    marketCap: 1_000_000 + (h % 20) * 1_000_000,
    volume24h: 200_000 + (h % 15) * 200_000,
    liquidity: 100_000 + (h % 10) * 100_000,
    priceUsd: 1,
    priceChange24h: (h % 40) - 20,
    txns24h: 50 + (h % 30) * 50,
    dexId: 'meteora',
    pairAddress: null,
  };
}

/**
 * Fetch market cap / volume / liquidity from DexScreener for a list of Solana
 * token mints. Batches up to 30 per request. Returns a map mint -> data.
 */
export async function getTokenMarketData(mints) {
  const unique = [...new Set((mints ?? []).filter(Boolean))];
  if (unique.length === 0) return {};
  if (isDryRun()) return Object.fromEntries(unique.map((m) => [m, mockData(m)]));

  const result = {};
  for (const group of chunk(unique, 30)) {
    try {
      const res = await fetch(`${DEX_TOKENS_URL}/${group.join(',')}`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const pairs = data.pairs ?? [];
      for (const mint of group) {
        const best = pickBestPair(pairs, mint);
        if (best) {
          const txns = best.txns?.h24 ?? {};
          result[mint] = {
            marketCap: best.marketCap ?? best.fdv ?? null,
            volume24h: best.volume?.h24 ?? 0,
            liquidity: best.liquidity?.usd ?? null,
            priceUsd: Number(best.priceUsd ?? 0),
            priceChange24h: best.priceChange?.h24 ?? null,
            txns24h: (txns.buys ?? 0) + (txns.sells ?? 0),
            dexId: best.dexId,
            pairAddress: best.pairAddress,
          };
        }
      }
    } catch { /* skip group on error, leave those mints unenriched */ }
  }
  return result;
}

export function getDexFilters() {
  const d = config.screening?.dexscreener ?? {};
  return {
    enabled: Boolean(d.enabled),
    minMarketCapUsd: Number(d.minMarketCapUsd ?? 0),
    maxMarketCapUsd: Number(d.maxMarketCapUsd ?? 0),
    minVolume24hUsd: Number(d.minVolume24hUsd ?? 0),
    minLiquidityUsd: Number(d.minLiquidityUsd ?? 0),
  };
}

/** Pure check: does a pool pass the configured marketcap/volume/liquidity filters? */
export function passesMarketFilter(pool, filters = getDexFilters()) {
  // If market data is unavailable (API down), don't block screening.
  if (pool.marketDataMissing) return { pass: true, reason: 'no market data' };

  const mc = pool.marketCap ?? null;
  const vol = pool.volume24hUsd ?? pool.volume24h ?? 0;
  const liq = pool.liquidityUsd ?? null;

  if (filters.minMarketCapUsd > 0 && (mc == null || mc < filters.minMarketCapUsd)) {
    return { pass: false, reason: `marketcap below $${filters.minMarketCapUsd.toLocaleString()}` };
  }
  if (filters.maxMarketCapUsd > 0 && mc != null && mc > filters.maxMarketCapUsd) {
    return { pass: false, reason: `marketcap above $${filters.maxMarketCapUsd.toLocaleString()}` };
  }
  if (filters.minVolume24hUsd > 0 && vol < filters.minVolume24hUsd) {
    return { pass: false, reason: `volume below $${filters.minVolume24hUsd.toLocaleString()}` };
  }
  if (filters.minLiquidityUsd > 0 && (liq == null || liq < filters.minLiquidityUsd)) {
    return { pass: false, reason: `liquidity below $${filters.minLiquidityUsd.toLocaleString()}` };
  }
  return { pass: true };
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * Derive real scoring factors from DexScreener market data, replacing the
 * hardcoded placeholders (volatility 0.15, holderQuality 0.5, binUtilization 0.5)
 * that the Meteora discovery path emits when it has no richer signal.
 */
export function deriveMetrics(md) {
  // Volatility proxy: absolute 24h price move. ~30%+ daily swing => max volatility.
  const volatility = md.priceChange24h != null
    ? clamp01(Math.abs(Number(md.priceChange24h)) / 30)
    : null;

  // Capital efficiency proxy: 24h turnover (volume / liquidity). ~3x => fully utilized.
  const binUtilization = (md.liquidity > 0 && md.volume24h != null)
    ? clamp01((md.volume24h / md.liquidity) / 3)
    : null;

  // Token quality proxy from real depth + trading activity (no holder API needed).
  let holderQuality = null;
  if (md.liquidity != null || md.txns24h != null) {
    const liqScore = clamp01((md.liquidity ?? 0) / 500_000);
    const actScore = clamp01((md.txns24h ?? 0) / 2_000);
    holderQuality = clamp01(0.6 * liqScore + 0.4 * actScore);
  }

  return { volatility, binUtilization, holderQuality };
}

/** Attach DexScreener market data to pools (mutates and returns the array). */
export async function enrichPoolsWithMarketData(pools) {
  const mints = pools.map((p) => p.tokenMint).filter(Boolean);
  const data = await getTokenMarketData(mints);
  const live = !isDryRun();
  for (const pool of pools) {
    const md = pool.tokenMint ? data[pool.tokenMint] : null;
    if (!md) {
      pool.marketDataMissing = true;
      continue;
    }
    pool.marketCap = md.marketCap;
    pool.liquidityUsd = md.liquidity;
    pool.priceUsd = md.priceUsd;
    pool.volume24hUsd = md.volume24h;

    // Only replace screening factors with live market data in mainnet mode so
    // dry-run fixtures stay deterministic.
    if (live) {
      if (md.volume24h) pool.volume24h = md.volume24h;
      const m = deriveMetrics(md);
      if (m.volatility != null) pool.volatility = m.volatility;
      if (m.binUtilization != null) pool.binUtilization = m.binUtilization;
      // Prefer a real holder signal (set upstream); otherwise fill the placeholder.
      if (m.holderQuality != null && (pool.holderQuality == null || pool.holderQuality === 0.5)) {
        pool.holderQuality = m.holderQuality;
      }
    }
  }
  return pools;
}
