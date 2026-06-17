import { register } from 'node:module';

let sdk = null;
let registered = false;

/**
 * Lazily load the Meteora DLMM SDK, registering an ESM interop loader on first
 * use so the SDK's bundler-oriented ESM build works under native Node ESM.
 * Only called on the live (non-dry-run) path, so dry-run and tests never
 * register the loader.
 */
export async function loadDlmm() {
  if (sdk) return sdk;
  if (!registered) {
    register('./dlmm-interop-loader.mjs', import.meta.url);
    registered = true;
  }
  const mod = await import('@meteora-ag/dlmm');
  sdk = mod.default ?? mod;
  return sdk;
}
