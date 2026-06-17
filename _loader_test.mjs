import { register } from 'node:module';
register('./_dir_loader.mjs', import.meta.url);
const m = await import('@meteora-ag/dlmm');
console.log('default type:', typeof m.default, 'has create:', typeof m.default?.create);
