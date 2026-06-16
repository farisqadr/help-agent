import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encryptKeypair, decryptKeypair, getSolBalance } from '../tools/wallet.js';
import { Keypair } from '@solana/web3.js';

describe('wallet', () => {
  it('encrypts and decrypts keypair', () => {
    const kp = Keypair.generate();
    const encrypted = encryptKeypair(Buffer.from(kp.secretKey), 'test-pass');
    const restored = decryptKeypair(encrypted, 'test-pass');
    assert.equal(restored.publicKey.toBase58(), kp.publicKey.toBase58());
  });

  it('returns mock balance in dry run', async () => {
    const balance = await getSolBalance();
    assert.ok(balance.sol > 0);
    assert.equal(balance.dryRun, true);
  });
});
