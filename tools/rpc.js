import { Connection } from '@solana/web3.js';
import { config, isDryRun } from '../config.js';

let connection = null;

export function getConnection() {
  if (!connection) {
    const url = config.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
    connection = new Connection(url, 'confirmed');
  }
  return connection;
}

export async function healthCheck() {
  if (isDryRun() && !config.HELIUS_RPC_URL) {
    return { ok: true, slot: 0, latencyMs: 0, dryRun: true };
  }
  const start = Date.now();
  try {
    const slot = await getConnection().getSlot();
    return { ok: true, slot, latencyMs: Date.now() - start, dryRun: isDryRun() };
  } catch (err) {
    return { ok: false, error: err.message, dryRun: isDryRun() };
  }
}
