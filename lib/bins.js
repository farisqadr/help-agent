export function autoRange(volatility) {
  const v = Math.max(0, Math.min(1, volatility ?? 0.15));
  const binCount = Math.round(10 + v * 40);
  const halfWidth = Math.round(binCount / 2);
  return { binCount, halfWidth };
}

export function calculateBins({ mode, currentPrice, volatility, binStep, activeBinId }) {
  const { halfWidth } = autoRange(volatility);
  const center = activeBinId ?? 8388608;

  switch (mode?.toUpperCase()) {
    case 'CURVE': {
      const width = halfWidth * 2;
      return {
        minBinId: center - width,
        maxBinId: center + width,
        mode: 'CURVE',
        binCount: width * 2 + 1,
      };
    }
    case 'BID_ASK':
    case 'BID-ASK': {
      return {
        minBinId: center - halfWidth * 2,
        maxBinId: center + Math.floor(halfWidth / 2),
        mode: 'BID_ASK',
        binCount: halfWidth * 2 + Math.floor(halfWidth / 2) + 1,
      };
    }
    case 'SPOT':
    default: {
      return {
        minBinId: center - Math.floor(halfWidth / 2),
        maxBinId: center + Math.floor(halfWidth / 2),
        mode: 'SPOT',
        binCount: halfWidth + 1,
      };
    }
  }
}
