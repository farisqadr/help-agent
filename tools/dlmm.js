import { PublicKey } from '@solana/web3.js';
import { config, isDryRun } from '../config.js';
import { getConnection } from './rpc.js';
import { getKeypair } from './wallet.js';

let dlmmModule = null;

async function loadDlmm() {
  if (!dlmmModule) {
    dlmmModule = await import('@meteora-ag/dlmm');
  }
  return dlmmModule;
}

const DRY_POOL = {
  poolAddress: 'DryRunPool1111111111111111111111111111111',
  name: 'DRY/SOL',
  binStep: 10,
  activeBin: 8388608,
  currentPrice: 1.0,
  feeApr: 0.45,
  volume24h: 1_000_000,
  volatility: 0.15,
};

export async function getPoolInfo(poolAddress) {
  if (isDryRun()) {
    return { ...DRY_POOL, poolAddress };
  }
  const DLMM = await loadDlmm();
  const pool = await DLMM.default.create(getConnection(), new PublicKey(poolAddress));
  const activeBin = await pool.getActiveBin();
  return {
    poolAddress,
    name: `${pool.tokenX?.mint?.toString?.()?.slice(0, 4) ?? 'X'}/SOL`,
    binStep: pool.lbPair.binStep,
    activeBin: activeBin.binId,
    currentPrice: Number(activeBin.price),
    feeApr: 0,
    volume24h: 0,
    volatility: 0.1,
  };
}

export async function getActiveBin(poolAddress) {
  if (isDryRun()) {
    return { binId: DRY_POOL.activeBin, price: DRY_POOL.currentPrice };
  }
  const DLMM = await loadDlmm();
  const pool = await DLMM.default.create(getConnection(), new PublicKey(poolAddress));
  const bin = await pool.getActiveBin();
  return { binId: bin.binId, price: Number(bin.price) };
}

export async function listUserPositions(walletPubkey) {
  if (isDryRun()) {
    return [];
  }
  const DLMM = await loadDlmm();
  const positions = await DLMM.default.getAllLbPairPositionsByUser(
    getConnection(),
    new PublicKey(walletPubkey)
  );
  return [...positions.entries()].map(([pool, { lbPairPositionsData }]) => ({
    poolAddress: pool.toBase58(),
    positions: lbPairPositionsData.map((p) => ({
      positionId: p.publicKey.toBase58(),
      binIds: p.positionData.positionBinData?.map((b) => b.binId) ?? [],
    })),
  }));
}

export async function deployPosition({ poolAddress, solAmount, mode, binRange }) {
  if (isDryRun()) {
    return {
      dryRun: true,
      positionId: `dry-pos-${Date.now()}`,
      poolAddress,
      solAmount,
      mode,
      binRange,
      signature: 'dry-run-deploy-sig',
    };
  }
  const DLMM = await loadDlmm();
  const kp = getKeypair();
  const pool = await DLMM.default.create(getConnection(), new PublicKey(poolAddress));
  const { minBinId, maxBinId } = binRange;
  const tx = await pool.initializePositionAndAddLiquidityByStrategy({
    positionPubKey: (await import('@solana/web3.js')).Keypair.generate().publicKey,
    totalXAmount: 0,
    totalYAmount: Math.floor(solAmount * 1e9),
    strategy: { minBinId, maxBinId, strategyType: mode },
    user: kp.publicKey,
  });
  const sig = await getConnection().sendTransaction(tx, [kp]);
  await getConnection().confirmTransaction(sig, 'confirmed');
  return { positionId: tx.positionPubKey?.toBase58?.() ?? 'unknown', signature: sig };
}

export async function closePosition(positionId, poolAddress) {
  if (isDryRun()) {
    return {
      dryRun: true,
      positionId,
      poolAddress,
      withdrawnSol: 1.05,
      signature: 'dry-run-close-sig',
    };
  }
  const DLMM = await loadDlmm();
  const kp = getKeypair();
  const pool = await DLMM.default.create(getConnection(), new PublicKey(poolAddress));
  const tx = await pool.removeLiquidity({
    position: new PublicKey(positionId),
    user: kp.publicKey,
    fromBinId: pool.lbPair.activeId - 10,
    toBinId: pool.lbPair.activeId + 10,
    bps: 10000,
  });
  const sig = await getConnection().sendTransaction(tx, [kp]);
  await getConnection().confirmTransaction(sig, 'confirmed');
  return { positionId, signature: sig };
}

export async function getCurrentPrice(poolAddress) {
  const bin = await getActiveBin(poolAddress);
  return bin.price;
}
