import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config, WALLET_FILE } from '../config.js';
import { decryptKeypair } from '../tools/wallet.js';
import { getConnection } from '../tools/rpc.js';

/** Parse a pasted secret key (base58 string or JSON byte array) into a Keypair. */
export function keypairFromSecret(raw) {
  const s = String(raw).trim();
  if (!s) throw new Error('Empty private key');
  try {
    return Keypair.fromSecretKey(bs58.decode(s));
  } catch { /* try next format */ }
  try {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(s)));
  } catch { /* invalid */ }
  throw new Error('Invalid private key (expected base58 string or JSON byte array)');
}

function resolveKeypair(raw) {
  if (raw.includes(':')) {
    const [encrypted, passphrase] = raw.split(':');
    return decryptKeypair(encrypted, passphrase);
  }
  return keypairFromSecret(raw);
}

/** Public, secret-free wallet info for the UI. */
export function getWalletInfo() {
  const raw = config.WALLET_PRIVATE_KEY;
  if (!raw) return { hasKey: false, pubkey: null };
  try {
    const kp = resolveKeypair(raw);
    return { hasKey: true, pubkey: kp.publicKey.toBase58() };
  } catch (err) {
    return { hasKey: true, pubkey: null, error: err.message };
  }
}

export function saveWalletKey(privateKey) {
  const kp = keypairFromSecret(privateKey);
  const value = String(privateKey).trim();
  config.WALLET_PRIVATE_KEY = value;
  writeFileSync(WALLET_FILE, value, { mode: 0o600 });
  return { hasKey: true, pubkey: kp.publicKey.toBase58() };
}

export function clearWalletKey() {
  config.WALLET_PRIVATE_KEY = '';
  if (existsSync(WALLET_FILE)) unlinkSync(WALLET_FILE);
  return { hasKey: false, pubkey: null };
}

/** Verify the configured wallet against the live RPC (works in any mode). */
export async function testWalletConnection() {
  const info = getWalletInfo();
  if (!info.hasKey) throw new Error('No wallet configured');
  if (!info.pubkey) throw new Error(`Wallet key invalid: ${info.error}`);

  try {
    const conn = getConnection();
    const [slot, lamports] = await Promise.all([
      conn.getSlot(),
      conn.getBalance(new PublicKey(info.pubkey)),
    ]);
    return {
      ok: true,
      pubkey: info.pubkey,
      sol: lamports / 1e9,
      slot,
      rpc: config.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
    };
  } catch (err) {
    return { ok: false, pubkey: info.pubkey, error: err.message };
  }
}
