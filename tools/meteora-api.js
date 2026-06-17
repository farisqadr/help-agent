import { PublicKey } from '@solana/web3.js';
import { config, isDryRun } from '../config.js';
import { getConnection } from './rpc.js';
import { loadDlmm } from '../lib/dlmm-sdk.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';

const API_ENDPOINTS = [
  config.screening?.poolListUrl,
  'https://dlmm.datapi.meteora.ag/pair/all',
  'https://dlmm-api.meteora.ag/pair/all',
].filter(Boolean);

function mapApiPair(pair) {
  const address = pair.address ?? pair.pubkey ?? pair.lb_pair_address;
  if (!address) return null;
  return {
    poolAddress: address,
    name: pair.name ?? `${pair.mint_x?.slice(0, 4) ?? 'X'}/SOL`,
    symbol: pair.symbol ?? pair.name?.split('/')?.[0] ?? 'UNK',
    volume24h: pair.trade_volume_24h ?? pair.volume24h ?? pair.volume?.hour_24 ?? 0,
    feeApr: pair.apr ?? pair.fee_apr ?? 0,
    volatility: pair.volatility ?? 0.15,
    holderQuality: 0.5,
    binUtilization: pair.liquidity ? Math.min(1, Number(pair.liquidity) / 1e9) : 0.5,
    metadata: { categories: pair.tags ?? pair.categories ?? [] },
    tokenMint: pair.mint_x ?? pair.token_x_mint,
  };
}

async function fetchFromApi() {
  for (const url of API_ENDPOINTS) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.pairs ?? data.data ?? [];
      const mapped = list.map(mapApiPair).filter(Boolean);
      if (mapped.length > 0) return mapped;
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchFromRpc(limit = 50) {
  if (!config.HELIUS_RPC_URL) return null;
  const DLMM = await loadDlmm();
  const pairs = await DLMM.getLbPairs(getConnection());
  const solPairs = pairs.filter(({ account }) => {
    const x = account.tokenXMint.toBase58();
    const y = account.tokenYMint.toBase58();
    return x === SOL_MINT || y === SOL_MINT;
  });

  return solPairs.slice(0, limit).map(({ publicKey, account }) => ({
    poolAddress: publicKey.toBase58(),
    name: `${account.tokenXMint.toBase58().slice(0, 4)}/SOL`,
    symbol: 'POOL',
    volume24h: 0,
    feeApr: Number(account.parameters?.baseFactor ?? 0) / 10000,
    volatility: 0.15,
    holderQuality: 0.5,
    binUtilization: 0.5,
    metadata: { categories: [] },
    tokenMint: account.tokenXMint.toBase58() === SOL_MINT
      ? account.tokenYMint.toBase58()
      : account.tokenXMint.toBase58(),
  }));
}

export async function discoverPoolsLive(limit = 50) {
  const fromApi = await fetchFromApi();
  if (fromApi?.length) return fromApi.slice(0, limit);

  const fromRpc = await fetchFromRpc(limit);
  if (fromRpc?.length) return fromRpc;

  return null;
}

export { SOL_MINT };
