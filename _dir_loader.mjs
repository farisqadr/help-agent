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
