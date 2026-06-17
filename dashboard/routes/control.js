import { Router } from 'express';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readUserConfig, updateUserConfig } from '../../lib/config-store.js';
import { runScreeningCycle, runManagementCycle } from '../../lib/cycles.js';
import { getTopCandidates, screenNow } from '../../tools/screening.js';
import { executeTool } from '../../tools/executor.js';
import { listOpenPositions, updatePosition } from '../../state.js';
import { startDaemon, stopDaemon, status as daemonStatus } from '../../lib/daemon.js';
import { isDryRun, setDryRun } from '../../config.js';
import { getWalletInfo, saveWalletKey, clearWalletKey, testWalletConnection, connectWallet, disconnectWallet } from '../../lib/wallet-store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = resolve(__dirname, '..', '..', 'logs');

async function readJsonLines(filename, limit = 50) {
  try {
    const raw = await readFile(resolve(LOGS_DIR, filename), 'utf8');
    const lines = raw.trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l)).reverse();
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function asyncHandler(fn) {
  return (req, res) => fn(req, res).catch((err) => {
    console.error('[api]', err.message);
    res.status(400).json({ error: err.message });
  });
}

export function createControlRouter() {
  const router = Router();

  // ---- Config ----
  router.get('/api/config', asyncHandler(async (_req, res) => {
    res.json(await readUserConfig());
  }));

  router.put('/api/config', asyncHandler(async (req, res) => {
    const updated = await updateUserConfig(req.body ?? {});
    res.json(updated);
  }));

  // ---- Screening ----
  router.get('/api/candidates', asyncHandler(async (req, res) => {
    const limit = Number(req.query.limit) || undefined;
    res.json(await getTopCandidates(limit));
  }));

  // Screen Now: immediate discover + filter + score, no deploy.
  router.post('/api/screen-now', asyncHandler(async (req, res) => {
    const limit = Number(req.body?.limit) || undefined;
    res.json(await screenNow(limit));
  }));

  router.post('/api/actions/screen', asyncHandler(async (_req, res) => {
    const result = await runScreeningCycle();
    res.json({ ok: true, result });
  }));

  router.post('/api/actions/manage', asyncHandler(async (_req, res) => {
    const result = await runManagementCycle();
    res.json({ ok: true, result });
  }));

  router.post('/api/actions/feedback', asyncHandler(async (_req, res) => {
    const result = await executeTool('runFeedbackLoop', {});
    res.json({ ok: true, screening: result.screening, exit: result.exit });
  }));

  // ---- Positions ----
  router.post('/api/positions/deploy', asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!body.poolAddress) throw new Error('poolAddress is required');
    const result = await executeTool('deployPosition', {
      poolAddress: body.poolAddress,
      solAmount: body.solAmount != null ? Number(body.solAmount) : undefined,
      mode: body.mode,
      rangeMode: body.rangeMode,
      manualRange: body.manualRange,
      volatility: body.volatility != null ? Number(body.volatility) : undefined,
      tokenMint: body.tokenMint,
      name: body.name,
      symbol: body.symbol,
      exit: body.exit,
    });
    res.json({ ok: true, ...result });
  }));

  router.post('/api/positions/close', asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    if (!body.positionId) throw new Error('positionId is required');
    const positions = await listOpenPositions();
    const position = positions.find((p) => p.id === body.positionId);
    if (!position) throw new Error(`Position not found: ${body.positionId}`);
    const result = await executeTool('closePosition', {
      positionId: body.positionId,
      poolAddress: position.poolAddress,
      reason: body.reason ?? 'manual',
    });
    res.json({ ok: true, ...result });
  }));

  router.put('/api/positions/:id/exit', asyncHandler(async (req, res) => {
    const exit = req.body ?? {};
    const updated = await updatePosition(req.params.id, { exit });
    res.json({ ok: true, position: updated });
  }));

  // ---- Network mode ----
  router.get('/api/mode', asyncHandler(async (_req, res) => {
    res.json({ dryRun: isDryRun(), wallet: getWalletInfo() });
  }));

  router.post('/api/mode', asyncHandler(async (req, res) => {
    const dryRun = Boolean(req.body?.dryRun);
    if (!dryRun) {
      const wallet = getWalletInfo();
      if (!wallet.canTrade) {
        throw new Error(
          'Cannot switch to mainnet: the agent needs a signing key to trade autonomously. ' +
          'Import your private key (Solflare → Settings → Export Private Key).'
        );
      }
    }
    res.json({ dryRun: setDryRun(dryRun), wallet: getWalletInfo() });
  }));

  // ---- Wallet ----
  router.get('/api/wallet', asyncHandler(async (_req, res) => {
    res.json(getWalletInfo());
  }));

  router.post('/api/wallet', asyncHandler(async (req, res) => {
    if (!req.body?.privateKey) throw new Error('privateKey is required');
    res.json(saveWalletKey(req.body.privateKey));
  }));

  router.delete('/api/wallet', asyncHandler(async (_req, res) => {
    // Switching back to dry-run protects against running mainnet without a key.
    if (!isDryRun()) setDryRun(true);
    res.json(clearWalletKey());
  }));

  router.post('/api/wallet/test', asyncHandler(async (_req, res) => {
    res.json(await testWalletConnection());
  }));

  router.post('/api/wallet/connect', asyncHandler(async (req, res) => {
    if (!req.body?.pubkey) throw new Error('pubkey is required');
    res.json(connectWallet(req.body.pubkey));
  }));

  router.post('/api/wallet/disconnect', asyncHandler(async (_req, res) => {
    res.json(disconnectWallet());
  }));

  // ---- Daemon ----
  router.get('/api/daemon', asyncHandler(async (_req, res) => {
    res.json(daemonStatus());
  }));

  router.post('/api/daemon/start', asyncHandler(async (_req, res) => {
    res.json(startDaemon({ runImmediately: true }));
  }));

  router.post('/api/daemon/stop', asyncHandler(async (_req, res) => {
    res.json(stopDaemon());
  }));

  // ---- Logs ----
  router.get('/api/logs/decisions', asyncHandler(async (req, res) => {
    res.json({ entries: await readJsonLines('decision-log.json', Number(req.query.limit) || 50) });
  }));

  router.get('/api/logs/screening', asyncHandler(async (req, res) => {
    res.json({ entries: await readJsonLines('screening-log.json', Number(req.query.limit) || 50) });
  }));

  return router;
}
