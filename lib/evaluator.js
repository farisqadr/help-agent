import { config } from '../config.js';

/**
 * Resolve effective exit thresholds for a position: per-position overrides
 * (position.exit) take precedence over the global config.exit defaults.
 */
export function resolveExitPlan(position = {}) {
  const globalExit = config.exit ?? {};
  const posExit = position.exit ?? {};
  return {
    takeProfitPct: posExit.takeProfitPct ?? globalExit.takeProfitPct ?? 10,
    stopLossPct: posExit.stopLossPct ?? globalExit.stopLossPct ?? 5,
    trailingStopPct: posExit.trailingStopPct ?? globalExit.trailingStopPct ?? 3,
    trailingEnabled: posExit.trailingEnabled ?? globalExit.trailingEnabled ?? true,
    autoSwapToSol: posExit.autoSwapToSol ?? globalExit.autoSwapToSol ?? true,
  };
}

export function evaluatePosition(position, currentPrice) {
  const plan = resolveExitPlan(position);

  if (!position.entryPrice) {
    return { action: 'hold', reason: 'no entry price' };
  }

  const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const peakPnlPct = Math.max(position.peakPnlPct ?? 0, pnlPct);

  if (pnlPct >= plan.takeProfitPct) {
    return { action: 'close', reason: 'take_profit', pnlPct, peakPnlPct, plan };
  }

  if (pnlPct <= -plan.stopLossPct) {
    return { action: 'close', reason: 'stop_loss', pnlPct, peakPnlPct, plan };
  }

  if (
    plan.trailingEnabled &&
    peakPnlPct > plan.trailingStopPct &&
    pnlPct < peakPnlPct - plan.trailingStopPct
  ) {
    return { action: 'close', reason: 'trailing_stop', pnlPct, peakPnlPct, plan };
  }

  return { action: 'hold', reason: 'within_thresholds', pnlPct, peakPnlPct, plan };
}
