import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { config, WALLET_FILE } from '../config.js';
import { decryptKeypair, getSolBalance } from '../tools/wallet.js';
import { getConnection } from '../tools/rpc.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADDRESS_FILE = resolve(__dirname, '..', '.wallet-address');

// Connected (watch/identity) address from a browser wallet like Solflare.
// This is a public key only — it does NOT grant the daemon signing ability.
let connectedAddress = '';
try {
  connectedAddress = readFileSync(ADDRESS_FILE, 'utf8').trim();
} catch {
  connectedAddress = '';
}

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
  const base = {
    connectedAddress: connectedAddress || null,
    canTrade: false,
  };
  if (!raw) {
    return {
      ...base,
      hasKey: false,
      pubkey: null,
      source: connectedAddress ? 'solflare' : 'none',
    };
  }
  try {
    const kp = resolveKeypair(raw);
    return {
      ...base,
      hasKey: true,
      pubkey: kp.publicKey.toBase58(),
      source: 'imported',
      canTrade: true,
    };
  } catch (err) {
    return { ...base, hasKey: true, pubkey: null, source: 'imported', error: err.message };
  }
}

/** Store a connected browser-wallet (Solflare) address as the identity/watch address. */
export function connectWallet(pubkey) {
  const pk = new PublicKey(String(pubkey).trim()); // throws on invalid
  connectedAddress = pk.toBase58();
  writeFileSync(ADDRESS_FILE, connectedAddress);
  return getWalletInfo();
}

export function disconnectWallet() {
  connectedAddress = '';
  if (existsSync(ADDRESS_FILE)) unlinkSync(ADDRESS_FILE);
  return getWalletInfo();
}

export function saveWalletKey(privateKey) {
  const kp = keypairFromSecret(privateKey);
  const pubkey = kp.publicKey.toBase58();

  // Safety: if a Solflare wallet is connected, the imported key must match it.
  if (connectedAddress && connectedAddress !== pubkey) {
    throw new Error(
      `Imported key (${pubkey}) does not match connected Solflare wallet (${connectedAddress}). ` +
      'Disconnect first or import the matching key.'
    );
  }

  const value = String(privateKey).trim();
  config.WALLET_PRIVATE_KEY = value;
  writeFileSync(WALLET_FILE, value, { mode: 0o600 });
  // Align the identity address with the imported signing key.
  connectedAddress = pubkey;
  writeFileSync(ADDRESS_FILE, connectedAddress);
  return getWalletInfo();
}

export function clearWalletKey() {
  config.WALLET_PRIVATE_KEY = '';
  if (existsSync(WALLET_FILE)) unlinkSync(WALLET_FILE);
  return getWalletInfo();
}

/**
 * Balance for the Overview card. Prefers the real on-chain balance of the active
 * address (imported key OR connected Solflare watch address) when an RPC is
 * configured, so connecting Solflare immediately reflects the wallet's balance.
 * Falls back to the simulated balance only when there's no address/RPC.
 */
export async function getWalletBalance() {
  const info = getWalletInfo();
  const address = info.pubkey || info.connectedAddress;
  if (address && config.HELIUS_RPC_URL) {
    try {
      const lamports = await getConnection().getBalance(new PublicKey(address));
      return {
        sol: lamports / 1e9,
        lamports,
        pubkey: address,
        watchOnly: !info.canTrade,
        source: info.source,
      };
    } catch (err) {
      return { sol: null, error: err.message, pubkey: address, watchOnly: !info.canTrade, source: info.source };
    }
  }
  return getSolBalance();
}

/** Verify the active wallet against the live RPC (works in any mode). */
export async function testWalletConnection() {
  const info = getWalletInfo();
  const address = info.pubkey || info.connectedAddress;
  if (!address) throw new Error('No wallet configured');
  if (info.hasKey && !info.pubkey) throw new Error(`Wallet key invalid: ${info.error}`);

  try {
    const conn = getConnection();
    const [slot, lamports] = await Promise.all([
      conn.getSlot(),
      conn.getBalance(new PublicKey(address)),
    ]);
    return {
      ok: true,
      pubkey: address,
      canTrade: info.canTrade,
      sol: lamports / 1e9,
      slot,
      rpc: config.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com',
    };
  } catch (err) {
    return { ok: false, pubkey: address, error: err.message };
  }
}
