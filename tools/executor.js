import { config } from '../config.js';
import { getTopCandidates } from './screening.js';
import { passesRiskFilter } from './risk.js';
import { getPoolInfo, deployPosition as dlmmDeploy, closePosition as dlmmClose, getCurrentPrice } from './dlmm.js';
import { getSolBalance, swapToSol } from './wallet.js';
import { listOpenPositions, openPosition, updatePosition, closePositionState } from '../state.js';
import { evaluatePosition } from '../lib/evaluator.js';
import { calculateBins } from '../lib/bins.js';
import { searchSimilarPatterns } from './study.js';
import { logScreening, logDecision } from '../lib/logger.js';
import { runFeedbackLoop } from '../lib/feedback-loop.js';

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

    case 'deployPosition': {
      const balance = await getSolBalance();
      const maxDeploy = Math.max(0, balance.sol - MIN_SOL_RESERVE) * MAX_DEPLOY_PCT;
      const solAmount = Math.min(args.solAmount ?? maxDeploy, maxDeploy);

      if (solAmount <= 0) {
        throw new Error('Insufficient SOL for deployment');
      }

      const pool = await getPoolInfo(args.poolAddress);
      const mode = args.mode ?? config.deploy?.defaultMode ?? 'SPOT';
      const binRange = calculateBins({
        mode,
        currentPrice: pool.currentPrice,
        volatility: args.volatility ?? pool.volatility ?? 0.15,
        activeBinId: pool.activeBin,
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
        factors: args.factors ?? {},
      });

      await logDecision({
        action: 'deploy',
        poolAddress: args.poolAddress,
        positionId: position.id,
        solAmount,
        mode,
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
      const closed = await dlmmClose(args.positionId, args.poolAddress);
      const positions = await listOpenPositions();
      const position = positions.find((p) => p.id === args.positionId);
      const entryPrice = position?.entryPrice ?? 1;
      const exitPrice = await getCurrentPrice(args.poolAddress);
      const actualPnlSol = closed.withdrawnSol
        ? closed.withdrawnSol - (position?.solDeployed ?? 0)
        : (exitPrice - entryPrice) * (position?.solDeployed ?? 0);

      if (!config.DRY_RUN && position?.tokenMint) {
        await swapToSol(position.tokenMint, Math.floor(actualPnlSol * 1e9));
      }

      const state = await closePositionState(args.positionId, { actualPnlSol, exitPrice });
      await logDecision({ action: 'close', positionId: args.positionId, actualPnlSol, reason: args.reason });
      await runFeedbackLoop().catch((err) => console.warn('[feedback] skipped:', err.message));
      return { ...closed, actualPnlSol, state };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
