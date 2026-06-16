import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_CONFIG_PATH = resolve(__dirname, 'user-config.json');
export const WALLET_FILE = resolve(__dirname, '.wallet');

let userConfig = {};
try {
  userConfig = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf8'));
} catch {
  userConfig = {};
}

// Wallet key precedence: explicit env var, else the runtime-managed .wallet file.
let storedWallet = '';
try {
  storedWallet = readFileSync(WALLET_FILE, 'utf8').trim();
} catch {
  storedWallet = '';
}

// Mode precedence: explicit env var wins, otherwise the persisted user-config flag.
const envDryRun = process.env.DRY_RUN != null ? process.env.DRY_RUN !== 'false' : null;

export const config = {
  ...userConfig,
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL ?? '',
  JUPITER_API_KEY: process.env.JUPITER_API_KEY ?? '',
  LLM_API_URL: process.env.LLM_API_URL ?? 'https://api.openai.com/v1',
  LLM_API_KEY: process.env.LLM_API_KEY ?? '',
  DRY_RUN: envDryRun != null ? envDryRun : (userConfig.dryRun ?? true),
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY ?? storedWallet ?? '',
  DASHBOARD_PORT: Number(process.env.DASHBOARD_PORT ?? 4321),
  DASHBOARD_USER: process.env.DASHBOARD_USER ?? '',
  DASHBOARD_PASS: process.env.DASHBOARD_PASS ?? '',
};

export function isDryRun() {
  return config.DRY_RUN;
}

/** Toggle dry-run/mainnet at runtime and persist the choice to user-config.json. */
export function setDryRun(value) {
  config.DRY_RUN = Boolean(value);
  try {
    const uc = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf8'));
    uc.dryRun = config.DRY_RUN;
    writeFileSync(USER_CONFIG_PATH, JSON.stringify(uc, null, 2));
  } catch { /* config file optional */ }
  return config.DRY_RUN;
}

export function reloadUserConfig() {
  userConfig = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf8'));
  const { dryRun, ...rest } = userConfig;
  Object.assign(config, rest);
  return config;
}
