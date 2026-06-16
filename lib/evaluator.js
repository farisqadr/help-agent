import { config } from '../config.js';

export function evaluatePosition(position, currentPrice) {
  const exit = config.exit ?? {};
  const takeProfitPct = exit.takeProfitPct ?? 10;
  const stopLossPct = exit.stopLossPct ?? 5;
  const trailingStopPct = exit.trailingStopPct ?? 3;

  if (!position.entryPrice) {
    return { action: 'hold', reason: 'no entry price' };
  }

  const pnlPct = ((currentPrice - position.entryPrice) / position.entryPrice) * 100;
  const peakPnlPct = Math.max(position.peakPnlPct ?? 0, pnlPct);

  if (pnlPct >= takeProfitPct) {
    return { action: 'close', reason: 'take_profit', pnlPct, peakPnlPct };
  }

  if (pnlPct <= -stopLossPct) {
    return { action: 'close', reason: 'stop_loss', pnlPct, peakPnlPct };
  }

  if (peakPnlPct > trailingStopPct && pnlPct < peakPnlPct - trailingStopPct) {
    return { action: 'close', reason: 'trailing_stop', pnlPct, peakPnlPct };
  }

  return { action: 'hold', reason: 'within_thresholds', pnlPct, peakPnlPct };
}
