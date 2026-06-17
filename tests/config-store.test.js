import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readUserConfig, updateUserConfig } from '../lib/config-store.js';

const PATH = resolve('user-config.json');
let original;

async function restoreAtomic() {
  const tmp = `${PATH}.${process.pid}.restore.tmp`;
  await writeFile(tmp, original);
  await rename(tmp, PATH);
}

before(async () => { original = await readFile(PATH, 'utf8'); });
after(restoreAtomic);

describe('config-store', () => {
  it('clamps out-of-range numbers', async () => {
    const next = await updateUserConfig({ screeningIntervalMin: 99999, managementIntervalMin: 0 });
    assert.equal(next.screeningIntervalMin, 1440);
    assert.equal(next.managementIntervalMin, 1);
  });

  it('normalizes screening weights to sum 1', async () => {
    const next = await updateUserConfig({ screening: { weights: { volume24h: 2, feeApr: 2 } } });
    const sum = Object.values(next.screening.weights).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 0.0001);
  });

  it('dedupes and trims keyword blacklist', async () => {
    const next = await updateUserConfig({ risk: { keywordBlacklist: [' casino ', 'casino', 'rug'] } });
    assert.deepEqual(next.risk.keywordBlacklist.sort(), ['casino', 'rug']);
  });

  it('toggles auto-deploy and custom SOL size', async () => {
    let next = await updateUserConfig({ deploy: { autoDeploy: false, autoDeploySol: 1.5 } });
    assert.equal(next.deploy.autoDeploy, false);
    assert.equal(next.deploy.autoDeploySol, 1.5);

    next = await updateUserConfig({ deploy: { autoDeploy: true, autoDeploySol: null } });
    assert.equal(next.deploy.autoDeploy, true);
    assert.equal(next.deploy.autoDeploySol, null);
  });

  it('coerces exit booleans and persists', async () => {
    const next = await updateUserConfig({ exit: { autoSwapToSol: false, autoTune: true } });
    assert.equal(next.exit.autoSwapToSol, false);
    assert.equal(next.exit.autoTune, true);
    const reread = await readUserConfig();
    assert.equal(reread.exit.autoTune, true);
  });
});
