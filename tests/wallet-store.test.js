import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { resolve } from 'node:path';
import { config, WALLET_FILE } from '../config.js';
import { keypairFromSecret, getWalletInfo, saveWalletKey, clearWalletKey, connectWallet, disconnectWallet } from '../lib/wallet-store.js';

const ADDRESS_FILE = resolve('.wallet-address');
let backup = null;
const originalConfigKey = config.WALLET_PRIVATE_KEY;

before(() => {
  if (existsSync(WALLET_FILE)) backup = readFileSync(WALLET_FILE, 'utf8');
});
after(() => {
  if (backup != null) writeFileSync(WALLET_FILE, backup);
  else if (existsSync(WALLET_FILE)) unlinkSync(WALLET_FILE);
  config.WALLET_PRIVATE_KEY = originalConfigKey;
  disconnectWallet();
  if (existsSync(ADDRESS_FILE)) unlinkSync(ADDRESS_FILE);
});

describe('wallet-store', () => {
  const kp = Keypair.generate();
  const b58 = bs58.encode(kp.secretKey);
  const jsonArr = JSON.stringify(Array.from(kp.secretKey));

  it('parses base58 secret', () => {
    assert.equal(keypairFromSecret(b58).publicKey.toBase58(), kp.publicKey.toBase58());
  });

  it('parses JSON array secret', () => {
    assert.equal(keypairFromSecret(jsonArr).publicKey.toBase58(), kp.publicKey.toBase58());
  });

  it('rejects invalid secret', () => {
    assert.throws(() => keypairFromSecret('not-a-key'));
  });

  it('saves, reads info, and clears', () => {
    disconnectWallet();
    const saved = saveWalletKey(b58);
    assert.equal(saved.pubkey, kp.publicKey.toBase58());
    assert.equal(saved.canTrade, true);
    assert.ok(existsSync(WALLET_FILE));

    const info = getWalletInfo();
    assert.equal(info.hasKey, true);
    assert.equal(info.source, 'imported');
    assert.equal(info.pubkey, kp.publicKey.toBase58());

    const cleared = clearWalletKey();
    assert.equal(cleared.hasKey, false);
    assert.equal(getWalletInfo().hasKey, false);
  });

  it('connects and disconnects a Solflare address (watch-only)', () => {
    clearWalletKey();
    const other = Keypair.generate().publicKey.toBase58();
    const w = connectWallet(other);
    assert.equal(w.connectedAddress, other);
    assert.equal(w.source, 'solflare');
    assert.equal(w.canTrade, false);

    const d = disconnectWallet();
    assert.equal(d.connectedAddress, null);
  });

  it('rejects importing a key that mismatches connected wallet', () => {
    clearWalletKey();
    connectWallet(Keypair.generate().publicKey.toBase58());
    assert.throws(() => saveWalletKey(b58), /does not match connected/);
    disconnectWallet();
  });

  it('rejects invalid connect pubkey', () => {
    assert.throws(() => connectWallet('not-a-pubkey'));
  });
});
