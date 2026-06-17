import { config, isDryRun } from '../config.js';

// The Helius API key lives inside the RPC URL (…/?api-key=XXX). Reuse it for the
// data API rather than relying on a separate (often-unset) env var.
function heliusApiKey() {
  if (process.env.HELIUS_API_KEY) return process.env.HELIUS_API_KEY;
  try {
    return new URL(config.HELIUS_RPC_URL).searchParams.get('api-key') ?? '';
  } catch {
    return '';
  }
}

export async function getTokenMetadata(mint) {
  if (isDryRun()) {
    return {
      mint,
      name: 'Dry Token',
      symbol: 'DRY',
      description: 'Dry run token',
      categories: [],
      holderCount: 1000,
    };
  }
  const apiKey = heliusApiKey();
  if (!apiKey) {
    return { mint, name: 'Unknown', symbol: 'UNK', categories: [], holderCount: 0 };
  }
  const res = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mintAccounts: [mint] }),
  });
  if (!res.ok) {
    return { mint, name: 'Unknown', symbol: 'UNK', categories: [], holderCount: 0 };
  }
  const data = await res.json();
  const item = data[0] ?? {};
  return {
    mint,
    name: item.onChainMetadata?.metadata?.data?.name ?? 'Unknown',
    symbol: item.onChainMetadata?.metadata?.data?.symbol ?? 'UNK',
    description: item.offChainMetadata?.metadata?.description ?? '',
    categories: item.offChainMetadata?.metadata?.categories ?? [],
    holderCount: item.holderCount ?? 0,
  };
}

/**
 * Maps real holder count to a 0–1 quality score. Returns null when no real
 * holder count is available so callers can fall back to a market-derived proxy
 * instead of trusting a fabricated default.
 */
export async function getHolderQuality(mint) {
  const meta = await getTokenMetadata(mint);
  const count = Number(meta.holderCount ?? 0);
  if (!count) return null;
  if (count >= 1000) return 1.0;
  if (count >= 500) return 0.7;
  if (count >= 100) return 0.4;
  return 0.1;
}
