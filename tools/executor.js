import { config } from '../config.js';
import { getTopCandidates } from './screening.js';
import { passesRiskFilter } from './risk.js';
import { getPoolInfo, deployPosition as dlmmDeploy, closePosition as dlmmClose, getCurrentPrice, getActiveBin } from './dlmm.js';
import { getSolBalance, swapToSol, getTokenBalances } from './wallet.js';
import { listOpenPositions, openPosition, updatePosition, closePositionState } from '../state.js';
import { evaluatePosition, resolveExitPlan } from '../lib/evaluator.js';
import { calculateBins } from '../lib/bins.js';
import { searchSimilarPatterns } from './study.js';
import { logScreening, logDecision } from '../lib/logger.js';
import { runFeedbackLoop } from '../lib/feedback-loop.js';
import { healthCheck } from './rpc.js';
import { getTokenMetadata } from './token.js';

const MAX_DEPLOY_PCT = config.deploy?.maxDeployPct ?? 0.25;
const MIN_SOL_RESERVE = config.deploy?.minSolReserve ?? 0.05;
const MIN_SCORE = config.screening?.minScore ?? 0.5;

export async function executeTool(name, args = {}) {
  switch (name) {
    case 'getTopCandidates': {
      const result = await getTopCandidates(args.limit ?? config.screening?.topCandidatesLimit ?? 10);
      await logScreening(result);
      return result;
    }

    case 'passesRiskFilter':
      return passesRiskFilter(args);

    case 'getPoolInfo':
      return getPoolInfo(args.poolAddress);

    case 'getSolBalance':
      return getSolBalance();

    case 'searchSimilarPatterns':
      return searchSimilarPatterns(args.query, args.limit ?? 5);

    case 'getActiveBin':
      return getActiveBin(args.poolAddress);

    case 'getTokenMetadata':
      return getTokenMetadata(args.mint);

    case 'getTokenBalances':
      return getTokenBalances();

    case 'healthCheck':
      return healthCheck();

    case 'runFeedbackLoop':
      return runFeedbackLoop();

    case 'deployPosition': {
      // Entry-time protection: re-run the risk gate before committing capital so
      // banned keywords/categories block manual entries, not just screening.
      const guard = await checkEntryRisk(args);
      if (!guard.pass) {
        await logDecision({ action: 'reject_entry', poolAddress: args.poolAddress, reason: guard.reason });
        throw new Error(`Entry blocked by protection: ${guard.reason}`);
      }

      const balance = await getSolBalance();
      const maxDeploy = Math.max(0, balance.sol - MIN_SOL_RESERVE) * MAX_DEPLOY_PCT;
      const requested = args.solAmount ?? maxDeploy;
      const solAmount = Math.min(requested, maxDeploy);

      if (solAmount <= 0) {
        throw new Error('Insufficient SOL for deployment');
      }

      const pool = await getPoolInfo(args.poolAddress);
      const mode = args.mode ?? config.deploy?.defaultMode ?? 'SPOT';
      const rangeMode = args.rangeMode === 'manual' ? 'manual' : 'auto';
      const binRange = calculateBins({
        mode,
        currentPrice: pool.currentPrice,
        volatility: args.volatility ?? pool.volatility ?? 0.15,
        activeBinId: pool.activeBin,
        manualRange: rangeMode === 'manual' ? args.manualRange : undefined,
      });

      const deployed = await dlmmDeploy({
        poolAddress: args.poolAddress,
        solAmount,
        mode,
        binRange,
      });

      const position = await openPosition({
        positionId: deployed.positionId,
        poolAddress: args.poolAddress,
        strategyMode: mode,
        solAmount,
        entryPrice: pool.currentPrice,
        expectedPnlSol: solAmount * 0.1,
        binRange,
        rangeMode,
        tokenMint: args.tokenMint ?? pool.tokenMint ?? null,
        factors: args.factors ?? {},
        exit: sanitizeExitPlan(args.exit),
      });

      await logDecision({
        action: 'deploy',
        poolAddress: args.poolAddress,
        positionId: position.id,
        solAmount,
        mode,
        rangeMode,
      });

      return { ...deployed, position };
    }

    case 'listOpenPositions':
      return listOpenPositions();

    case 'evaluatePosition': {
      const positions = await listOpenPositions();
      const position = positions.find((p) => p.id === args.positionId);
      if (!position) throw new Error(`Position not found: ${args.positionId}`);
      const result = evaluatePosition(position, args.currentPrice);
      if (result.peakPnlPct != null) {
        await updatePosition(args.positionId, { peakPnlPct: result.peakPnlPct });
      }
      return result;
    }

    case 'closePosition': {
      const positions = await listOpenPositions();
      const position = positions.find((p) => p.id === args.positionId);
      const plan = resolveExitPlan(position ?? {});

      const closed = await dlmmClose(args.positionId, args.poolAddress);
      const entryPrice = position?.entryPrice ?? 1;
      const exitPrice = await getCurrentPrice(args.poolAddress);
      const actualPnlSol = closed.withdrawnSol
        ? closed.withdrawnSol - (position?.solDeployed ?? 0)
        : (exitPrice - entryPrice) * (position?.solDeployed ?? 0);

      // Auto zap-out: swap withdrawn token proceeds to SOL when enabled.
      let swap = null;
      if (plan.autoSwapToSol && position?.tokenMint) {
        swap = await swapToSol(position.tokenMint, Math.floor((closed.withdrawnSol ?? actualPnlSol) * 1e9));
      }

      const state = await closePositionState(args.positionId, { actualPnlSol, exitPrice });
      await logDecision({
        action: 'close',
        positionId: args.positionId,
        actualPnlSol,
        reason: args.reason,
        autoSwap: Boolean(swap),
      });
      await runFeedbackLoop().catch((err) => console.warn('[feedback] skipped:', err.message));
      return { ...closed, actualPnlSol, swap, state };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

const STRATEGY_MODES = ['SPOT', 'CURVE', 'BID_ASK'];

function sanitizeExitPlan(exit) {
  if (!exit || typeof exit !== 'object') return null;
  const plan = {};
  if (exit.takeProfitPct != null) plan.takeProfitPct = Number(exit.takeProfitPct);
  if (exit.stopLossPct != null) plan.stopLossPct = Number(exit.stopLossPct);
  if (exit.trailingStopPct != null) plan.trailingStopPct = Number(exit.trailingStopPct);
  if (exit.trailingEnabled != null) plan.trailingEnabled = Boolean(exit.trailingEnabled);
  if (exit.autoSwapToSol != null) plan.autoSwapToSol = Boolean(exit.autoSwapToSol);
  return Object.keys(plan).length ? plan : null;
}

async function checkEntryRisk(args) {
  const categories = args.metadata?.categories ?? [];
  let name = args.name ?? '';
  let symbol = args.symbol ?? '';
  let description = args.metadata?.description ?? '';

  // Enrich with token metadata when a mint is available (skipped in pure dry run fixtures).
  if (args.tokenMint) {
    try {
      const meta = await getTokenMetadata(args.tokenMint);
      name = name || meta.name;
      symbol = symbol || meta.symbol;
      description = description || meta.description;
      if (meta.categories?.length) categories.push(...meta.categories);
    } catch { /* metadata optional */ }
  }

  return passesRiskFilter({
    poolAddress: args.poolAddress,
    name,
    symbol,
    metadata: { categories, description },
  });
}
