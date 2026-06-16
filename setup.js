#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import bs58 from 'bs58';
import { Keypair } from '@solana/web3.js';
import { encryptKeypair } from './tools/wallet.js';

const args = process.argv.slice(2);

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function main() {
  const keyPath = args[0];
  let secretKey;

  if (keyPath) {
    const raw = readFileSync(keyPath, 'utf8').trim();
    try {
      secretKey = Uint8Array.from(JSON.parse(raw));
    } catch {
      secretKey = bs58.decode(raw);
    }
  } else {
    console.log('Generating new keypair...');
    const kp = Keypair.generate();
    secretKey = kp.secretKey;
    console.log('Public key:', kp.publicKey.toBase58());
  }

  const passphrase = await prompt('Encryption passphrase: ');
  const encrypted = encryptKeypair(Buffer.from(secretKey), passphrase);
  console.log('\nAdd to .env:\n');
  console.log(`WALLET_PRIVATE_KEY=${encrypted}:${passphrase}`);
  console.log('\nStore passphrase separately. Never commit .env.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
