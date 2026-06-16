import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { config, isDryRun } from '../config.js';
import { getConnection } from './rpc.js';

const ALGORITHM = 'aes-256-gcm';
const SALT = 'help-agent-wallet-v1';

function deriveKey(secret) {
  return scryptSync(secret, SALT, 32);
}

export function encryptKeypair(secretKey, passphrase) {
  const key = deriveKey(passphrase);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(secretKey), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

export function decryptKeypair(encryptedB64, passphrase) {
  const buf = Buffer.from(encryptedB64, 'base64');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const key = deriveKey(passphrase);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return Keypair.fromSecretKey(new Uint8Array(decrypted));
}

export function getKeypair() {
  if (isDryRun() && !config.WALLET_PRIVATE_KEY) {
    return Keypair.generate();
  }
  const raw = config.WALLET_PRIVATE_KEY;
  if (!raw) {
    throw new Error('WALLET_PRIVATE_KEY not set');
  }
  if (raw.includes(':')) {
    const [encrypted, passphrase] = raw.split(':');
    return decryptKeypair(encrypted, passphrase);
  }
  try {
    return Keypair.fromSecretKey(bs58.decode(raw));
  } catch {
    return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
  }
}

export async function getSolBalance() {
  if (isDryRun() && !config.HELIUS_RPC_URL) {
    return { sol: 10.0, lamports: 10_000_000_000, dryRun: true };
  }
  const kp = getKeypair();
  const lamports = await getConnection().getBalance(kp.publicKey);
  return { sol: lamports / 1e9, lamports, pubkey: kp.publicKey.toBase58() };
}

export async function getTokenBalances() {
  if (isDryRun()) {
    return [{ mint: 'So11111111111111111111111111111111111111112', amount: 10, decimals: 9 }];
  }
  const kp = getKeypair();
  const accounts = await getConnection().getParsedTokenAccountsByOwner(kp.publicKey, {
    programId: new (await import('@solana/web3.js')).PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
  });
  return accounts.value.map(({ account }) => {
    const info = account.data.parsed.info;
    return {
      mint: info.mint,
      amount: Number(info.tokenAmount.uiAmount),
      decimals: info.tokenAmount.decimals,
    };
  });
}

const JUPITER_QUOTE_URL = 'https://quote-api.jup.ag/v6';

export async function swapToSol(tokenMint, amount, slippageBps = 50) {
  if (isDryRun()) {
    return {
      dryRun: true,
      inputMint: tokenMint,
      outputMint: 'So11111111111111111111111111111111111111112',
      inAmount: amount,
      outAmount: amount * 0.99,
      signature: 'dry-run-swap-sig',
    };
  }

  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  const headers = { 'Content-Type': 'application/json' };
  if (config.JUPITER_API_KEY) {
    headers['x-api-key'] = config.JUPITER_API_KEY;
  }

  const quoteUrl = `${JUPITER_QUOTE_URL}/quote?inputMint=${tokenMint}&outputMint=${SOL_MINT}&amount=${amount}&slippageBps=${slippageBps}`;
  const quoteRes = await fetch(quoteUrl, { headers });
  if (!quoteRes.ok) throw new Error(`Jupiter quote failed: ${quoteRes.status}`);
  const quote = await quoteRes.json();

  const swapRes = await fetch(`${JUPITER_QUOTE_URL}/swap`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: getKeypair().publicKey.toBase58(),
      wrapAndUnwrapSol: true,
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap failed: ${swapRes.status}`);
  const { swapTransaction } = await swapRes.json();

  const { VersionedTransaction } = await import('@solana/web3.js');
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([getKeypair()]);
  const sig = await getConnection().sendTransaction(tx);
  await getConnection().confirmTransaction(sig, 'confirmed');
  return { signature: sig, outAmount: quote.outAmount };
}
