// ESM resolve/load hooks that make @meteora-ag/dlmm's bundled ESM build work
// under Node's native ESM loader.
//
// The SDK's dist/index.mjs was built for bundlers and (1) performs directory
// imports of @coral-xyz/anchor CJS subpaths (unsupported in native ESM) and
// (2) relies on named imports from anchor/borsh CJS modules that Node's
// cjs-module-lexer fails to detect. These hooks fix both:
//   - resolve: append /index.js to directory imports.
//   - load: replace anchor/borsh CJS modules with a synthetic ESM module that
//     re-exports the needed names from the CJS module via createRequire.

const SHIM = /@coral-xyz[\/]+(anchor|borsh)[\/]/;
const NAMES = ['AnchorError', 'AnchorProvider', 'BN', 'Program', 'bs58', 'u64', 'i64', 'struct'];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_UNSUPPORTED_DIR_IMPORT') {
      return nextResolve(specifier.replace(/\/$/, '') + '/index.js', context);
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file:') && SHIM.test(url) && url.endsWith('.js')) {
    let src = `import { createRequire } from 'node:module';\n`;
    src += `import { fileURLToPath } from 'node:url';\n`;
    src += `const cjs = createRequire(import.meta.url)(fileURLToPath(${JSON.stringify(url)}));\n`;
    src += `export default cjs;\n`;
    for (const n of NAMES) src += `export const ${n} = cjs[${JSON.stringify(n)}];\n`;
    return { format: 'module', shortCircuit: true, source: src };
  }
  return nextLoad(url, context);
}
