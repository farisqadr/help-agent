import { isDryRun } from '../config.js';

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
  const res = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${process.env.HELIUS_API_KEY ?? ''}`, {
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

export async function getHolderQuality(mint) {
  const meta = await getTokenMetadata(mint);
  const count = meta.holderCount ?? 0;
  if (count >= 1000) return 1.0;
  if (count >= 500) return 0.7;
  if (count >= 100) return 0.4;
  return 0.1;
}
