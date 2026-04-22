import {
  CtfCollateralAdapter,
  NegRiskCtfCollateralAdapter,
} from "generated";
import { getEventKey } from "../../utils/negRisk.js";

const NEG_RISK_ADAPTER_ADDR = "0xada200001000ef00d07553cee7006808f895c6f1";

const getOrInitStats = async (context: any, id: string) =>
  context.V2CtfAdapterStats.getOrCreate({
    id,
    totalSplits: 0n,
    totalMerges: 0n,
    totalRedemptions: 0n,
    totalSplitVolume: 0n,
    totalMergeVolume: 0n,
    totalRedemptionPayout: 0n,
  });

// ── CtfCollateralAdapter (pUSD-backed CTF) ─────────────────────────

CtfCollateralAdapter.PositionSplit.handler(async ({ event, context }) => {
  const stats = await getOrInitStats(context, event.srcAddress);
  const isNegRisk =
    event.srcAddress.toLowerCase() === NEG_RISK_ADAPTER_ADDR.toLowerCase();

  context.V2CtfSplit.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    stakeholder: event.params.stakeholder,
    collateralToken: event.params.collateralToken,
    parentCollectionId: event.params.parentCollectionId,
    conditionId: event.params.conditionId,
    partition: [...event.params.partition],
    amount: event.params.amount,
    txFrom: event.transaction.from ?? "",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    isNegRisk,
  });

  context.V2CtfAdapterStats.set({
    ...stats,
    totalSplits: stats.totalSplits + 1n,
    totalSplitVolume: stats.totalSplitVolume + event.params.amount,
  });
});

CtfCollateralAdapter.PositionsMerge.handler(async ({ event, context }) => {
  const stats = await getOrInitStats(context, event.srcAddress);
  const isNegRisk =
    event.srcAddress.toLowerCase() === NEG_RISK_ADAPTER_ADDR.toLowerCase();

  context.V2CtfMerge.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    stakeholder: event.params.stakeholder,
    collateralToken: event.params.collateralToken,
    parentCollectionId: event.params.parentCollectionId,
    conditionId: event.params.conditionId,
    partition: [...event.params.partition],
    amount: event.params.amount,
    txFrom: event.transaction.from ?? "",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    isNegRisk,
  });

  context.V2CtfAdapterStats.set({
    ...stats,
    totalMerges: stats.totalMerges + 1n,
    totalMergeVolume: stats.totalMergeVolume + event.params.amount,
  });
});

CtfCollateralAdapter.PayoutRedemption.handler(async ({ event, context }) => {
  const stats = await getOrInitStats(context, event.srcAddress);
  const isNegRisk =
    event.srcAddress.toLowerCase() === NEG_RISK_ADAPTER_ADDR.toLowerCase();

  context.V2CtfRedemption.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    redeemer: event.params.redeemer,
    collateralToken: event.params.collateralToken,
    parentCollectionId: event.params.parentCollectionId,
    conditionId: event.params.conditionId,
    indexSets: [...event.params.indexSets],
    payout: event.params.payout,
    txFrom: event.transaction.from ?? "",
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
    isNegRisk,
  });

  context.V2CtfAdapterStats.set({
    ...stats,
    totalRedemptions: stats.totalRedemptions + 1n,
    totalRedemptionPayout: stats.totalRedemptionPayout + event.params.payout,
  });
});

// ── NegRiskCtfCollateralAdapter — Wrapped/Unwrapped specific to neg-risk ─
// These events flow through the same V2PolyUSDWrap stream (same signature) so
// they join with regular pUSD wraps at the query layer. Use ExchangeStats-style
// attribution by tracking isNegRisk at the adapter level.

NegRiskCtfCollateralAdapter.Wrapped.handler(async ({ event, context }) => {
  context.V2PolyUSDWrap.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    eventType: "wrap_negrisk_ctf",
    caller: event.params.caller,
    asset: event.params.asset,
    to: event.params.to,
    txFrom: event.transaction.from ?? "",
    amount: event.params.amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

NegRiskCtfCollateralAdapter.Unwrapped.handler(async ({ event, context }) => {
  context.V2PolyUSDWrap.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    eventType: "unwrap_negrisk_ctf",
    caller: event.params.caller,
    asset: event.params.asset,
    to: event.params.to,
    txFrom: event.transaction.from ?? "",
    amount: event.params.amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});
