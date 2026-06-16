import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_CONFIG_PATH = resolve(__dirname, 'user-config.json');

let userConfig = {};
try {
  userConfig = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf8'));
} catch {
  userConfig = {};
}

export const config = {
  ...userConfig,
  HELIUS_RPC_URL: process.env.HELIUS_RPC_URL ?? '',
  JUPITER_API_KEY: process.env.JUPITER_API_KEY ?? '',
  LLM_API_URL: process.env.LLM_API_URL ?? 'https://api.openai.com/v1',
  LLM_API_KEY: process.env.LLM_API_KEY ?? '',
  DRY_RUN: process.env.DRY_RUN !== 'false',
  WALLET_PRIVATE_KEY: process.env.WALLET_PRIVATE_KEY ?? '',
  DASHBOARD_PORT: Number(process.env.DASHBOARD_PORT ?? 4321),
  DASHBOARD_USER: process.env.DASHBOARD_USER ?? '',
  DASHBOARD_PASS: process.env.DASHBOARD_PASS ?? '',
};

export function isDryRun() {
  return config.DRY_RUN;
}

export function reloadUserConfig() {
  userConfig = JSON.parse(readFileSync(USER_CONFIG_PATH, 'utf8'));
  Object.assign(config, userConfig);
  return config;
}
