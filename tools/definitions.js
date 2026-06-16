export const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'getTopCandidates',
      description: 'Discover and score DLMM pools, return top candidates after risk filtering',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max candidates to return' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'passesRiskFilter',
      description: 'Check if a pool passes risk filters',
      parameters: {
        type: 'object',
        properties: {
          poolAddress: { type: 'string' },
          name: { type: 'string' },
          symbol: { type: 'string' },
          metadata: { type: 'object' },
        },
        required: ['poolAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPoolInfo',
      description: 'Get Meteora DLMM pool information',
      parameters: {
        type: 'object',
        properties: {
          poolAddress: { type: 'string' },
        },
        required: ['poolAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'deployPosition',
      description: 'Deploy SOL liquidity to a DLMM pool',
      parameters: {
        type: 'object',
        properties: {
          poolAddress: { type: 'string' },
          solAmount: { type: 'number' },
          mode: { type: 'string', enum: ['SPOT', 'CURVE', 'BID_ASK'] },
          volatility: { type: 'number' },
        },
        required: ['poolAddress', 'solAmount'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listOpenPositions',
      description: 'List all open LP positions',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'evaluatePosition',
      description: 'Evaluate a position for TP/SL/trailing stop',
      parameters: {
        type: 'object',
        properties: {
          positionId: { type: 'string' },
          currentPrice: { type: 'number' },
        },
        required: ['positionId', 'currentPrice'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'closePosition',
      description: 'Close an open position and swap tokens to SOL',
      parameters: {
        type: 'object',
        properties: {
          positionId: { type: 'string' },
          poolAddress: { type: 'string' },
        },
        required: ['positionId', 'poolAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getSolBalance',
      description: 'Get wallet SOL balance',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getActiveBin',
      description: 'Get active bin ID and price for a DLMM pool',
      parameters: {
        type: 'object',
        properties: { poolAddress: { type: 'string' } },
        required: ['poolAddress'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTokenMetadata',
      description: 'Get token metadata including categories for risk filtering',
      parameters: {
        type: 'object',
        properties: { mint: { type: 'string' } },
        required: ['mint'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getTokenBalances',
      description: 'List SPL token balances in wallet',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'healthCheck',
      description: 'Check RPC connectivity and latency',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'runFeedbackLoop',
      description: 'Run feedback loop to tune screening weights from trade history',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'searchSimilarPatterns',
      description: 'Search ZVec memory for similar trade patterns',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['query'],
      },
    },
  },
];

const ROLE_TOOLS = {
  SCREENER: ['getTopCandidates', 'passesRiskFilter', 'getPoolInfo', 'deployPosition', 'getSolBalance', 'searchSimilarPatterns', 'getTokenMetadata', 'healthCheck'],
  MANAGER: ['listOpenPositions', 'evaluatePosition', 'closePosition', 'getPoolInfo', 'getSolBalance', 'getActiveBin', 'runFeedbackLoop'],
  GENERAL: ['getTopCandidates', 'listOpenPositions', 'getSolBalance', 'getPoolInfo', 'healthCheck', 'getTokenBalances'],
};

export function getToolsForRole(role) {
  const allowed = ROLE_TOOLS[role] ?? ROLE_TOOLS.GENERAL;
  return toolDefinitions.filter((t) => allowed.includes(t.function.name));
}
