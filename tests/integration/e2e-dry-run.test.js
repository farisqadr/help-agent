import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlink, readFile } from 'node:fs/promises';

const POSITIONS = 'positions.e2e-test.json';
process.env.POSITIONS_PATH = POSITIONS;
const { runDeterministicScreener, runDeterministicManager } = await import('../../agent.js');
const { config } = await import('../../config.js');

const SCREEN_LOG = 'logs/screening-log.json';

before(async () => {
  await unlink(POSITIONS).catch(() => {});
  await unlink(SCREEN_LOG).catch(() => {});
  // Make the cycle deterministic regardless of the live dashboard config.
  config.deploy = { ...config.deploy, autoDeploy: true, autoDeploySol: null };
  config.screening = { ...config.screening, dexscreener: { enabled: false } };
});

after(async () => {
  await unlink(POSITIONS).catch(() => {});
});

describe('e2e dry-run cycle', () => {
  it('screen deploys position and manage holds', async () => {
    const screenResult = await runDeterministicScreener();
    assert.ok(screenResult.candidates?.length > 0);
    assert.ok(screenResult.deployed);

    const manageResult = await runDeterministicManager();
    assert.ok(Array.isArray(manageResult));
    assert.equal(manageResult[0]?.action, 'hold');

    const log = await readFile(SCREEN_LOG, 'utf8');
    assert.ok(log.includes('screening'));
  });
});
