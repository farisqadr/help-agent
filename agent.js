import { config } from './config.js';
import { getSystemPrompt } from './prompt.js';
import { getToolsForRole } from './tools/definitions.js';
import { executeTool } from './tools/executor.js';
import { getPatternContext } from './tools/study.js';
import { getTopCandidates } from './tools/screening.js';
import {
  listOpenPositions,
  openPosition,
  updatePosition,
  closePositionState,
} from './state.js';
import {
  getPoolInfo,
  deployPosition as dlmmDeploy,
  closePosition as dlmmClose,
  getCurrentPrice,
} from './tools/dlmm.js';
import { calculateBins } from './lib/bins.js';
import { evaluatePosition } from './lib/evaluator.js';
import { logScreening, logDecision } from './lib/logger.js';
import { getSolBalance } from './tools/wallet.js';
import { runFeedbackLoop } from './lib/feedback-loop.js';

async function callLlm(messages, tools) {
  if (!config.LLM_API_KEY) {
    return null;
  }
  const res = await fetch(`${config.LLM_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      tools,
      tool_choice: 'auto',
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message;
}

export async function runDeterministicScreener() {
  const result = await getTopCandidates();
  await logScreening(result);

  if (result.candidates.length === 0) {
    console.log('[screener] no candidates passed filters');
    return result;
  }

  const top = result.candidates[0];
  const minScore = config.screening?.minScore ?? 0.5;

  if (top.score < minScore) {
    await logDecision({ action: 'skip', reason: 'score below threshold', score: top.score });
    console.log(`[screener] top candidate score ${top.score} below min ${minScore}`);
    return result;
  }

  if (config.deploy?.autoDeploy === false) {
    await logDecision({ action: 'skip', reason: 'auto-deploy disabled', poolAddress: top.poolAddress });
    console.log('[screener] auto-deploy disabled, skipping deploy');
    return result;
  }

  const open = await listOpenPositions();
  if (open.length > 0) {
    await logDecision({ action: 'skip', reason: 'position already open' });
    console.log('[screener] position already open, skipping deploy');
    return result;
  }

  const balance = await getSolBalance();
  const maxDeployPct = config.deploy?.maxDeployPct ?? 0.25;
  const minReserve = config.deploy?.minSolReserve ?? 0.05;
  const available = Math.max(0, balance.sol - minReserve);
  // Custom fixed size takes precedence over percentage-based sizing, capped by available balance.
  const customSol = config.deploy?.autoDeploySol;
  const solAmount = customSol > 0
    ? Math.min(customSol, available)
    : available * maxDeployPct;

  if (solAmount <= 0) {
    await logDecision({ action: 'skip', reason: 'insufficient SOL' });
    return result;
  }

  const pool = await getPoolInfo(top.poolAddress);
  const mode = config.deploy?.defaultMode ?? 'SPOT';
  const binRange = calculateBins({
    mode,
    currentPrice: pool.currentPrice,
    volatility: top.volatility ?? 0.15,
    activeBinId: pool.activeBin,
  });

  const deployed = await dlmmDeploy({
    poolAddress: top.poolAddress,
    solAmount,
    mode,
    binRange,
  });

  await openPosition({
    positionId: deployed.positionId,
    poolAddress: top.poolAddress,
    strategyMode: mode,
    solAmount,
    entryPrice: pool.currentPrice,
    expectedPnlSol: solAmount * 0.1,
    binRange,
    factors: top.factors,
  });

  await logDecision({
    action: 'deploy',
    poolAddress: top.poolAddress,
    positionId: deployed.positionId,
    solAmount,
    score: top.score,
  });

  console.log(`[screener] deployed ${solAmount} SOL to ${top.name} (score ${top.score.toFixed(3)})`);
  return { ...result, deployed };
}

export async function runDeterministicManager() {
  const positions = await listOpenPositions();
  const results = [];

  for (const position of positions) {
    const currentPrice = await getCurrentPrice(position.poolAddress);
    const evaluation = evaluatePosition(position, currentPrice);

    if (evaluation.peakPnlPct != null) {
      await updatePosition(position.id, { peakPnlPct: evaluation.peakPnlPct });
    }

    if (evaluation.action === 'close') {
      const closed = await dlmmClose(position.id, position.poolAddress);
      const actualPnlSol = closed.withdrawnSol
        ? closed.withdrawnSol - position.solDeployed
        : ((currentPrice - position.entryPrice) / position.entryPrice) * position.solDeployed;

      await closePositionState(position.id, { actualPnlSol, exitPrice: currentPrice });
      await logDecision({
        action: 'close',
        positionId: position.id,
        reason: evaluation.reason,
        pnlPct: evaluation.pnlPct,
        actualPnlSol,
      });
      await runFeedbackLoop().catch((err) => console.warn('[feedback] skipped:', err.message));
      console.log(`[manager] closed ${position.id}: ${evaluation.reason} (PnL ${evaluation.pnlPct?.toFixed(2)}%)`);
      results.push({ positionId: position.id, action: 'close', ...evaluation });
    } else {
      console.log(`[manager] holding ${position.id}: ${evaluation.pnlPct?.toFixed(2)}% PnL`);
      results.push({ positionId: position.id, action: 'hold', ...evaluation });
    }
  }

  return results;
}

export async function agentLoop(role, task) {
  const patternContext = await getPatternContext(task).catch(() => '');
  const systemPrompt = getSystemPrompt(role) + (patternContext ? `\n\nSimilar past trades:\n${patternContext}` : '');
  const tools = getToolsForRole(role);

  const message = await callLlm(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task },
    ],
    tools
  );

  if (message?.tool_calls?.length) {
    const results = [];
    for (const call of message.tool_calls) {
      const args = JSON.parse(call.function.arguments || '{}');
      const result = await executeTool(call.function.name, args);
      results.push({ tool: call.function.name, result });
    }
    return results;
  }

  if (role === 'SCREENER') return runDeterministicScreener();
  if (role === 'MANAGER') return runDeterministicManager();
  return { role, task, mode: 'deterministic_fallback' };
}
