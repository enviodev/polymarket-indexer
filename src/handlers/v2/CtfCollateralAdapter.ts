import { indexer } from "envio";
import { getAddress } from "viem";
import { getEventKey } from "../../utils/negRisk.js";
import {
  COLLATERAL_SCALE,
  FIFTY_CENTS,
  V2_EXCHANGES,
  CTF_COLLATERAL_ADAPTER,
  NEG_RISK_CTF_COLLATERAL_ADAPTER,
} from "../../utils/constants.js";
import {
  updateUserPositionWithBuy,
  updateUserPositionWithSell,
  loadOrCreateUserPosition,
} from "../../utils/pnl.js";

const NEG_RISK_ADAPTER_ADDR = NEG_RISK_CTF_COLLATERAL_ADAPTER;

// Exchange-mediated adapter operations get user-level PnL from OrderFilled;
// only direct user calls should book split/merge/redemption PnL here.
const SKIP_PNL = new Set(V2_EXCHANGES.map((a) => a.toLowerCase()));

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

// ── Adapter position lifecycle (pUSD-backed CTF) ───────────────────
// Shared between CtfCollateralAdapter and NegRiskCtfCollateralAdapter:
// same event shapes, distinguished per-row via isNegRisk (srcAddress).

const onPositionSplit = async ({ event, context }: any) => {
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

    // PnL: split = buying both outcomes at 50 cents each (V1 parity).
    // Condition.positionIds are USDC-derived and match V2 tokenIds.
    const stakeholderLower = event.params.stakeholder.toLowerCase();
    if (!SKIP_PNL.has(stakeholderLower)) {
      const condition = await context.Condition.get(event.params.conditionId);
      if (condition) {
        for (const positionId of condition.positionIds) {
          await updateUserPositionWithBuy(
            context,
            event.params.stakeholder,
            positionId,
            FIFTY_CENTS,
            event.params.amount,
          );
        }
      }
    }
};

const onPositionsMerge = async ({ event, context }: any) => {
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

    // PnL: merge = selling both outcomes at 50 cents each (V1 parity)
    const stakeholderLower = event.params.stakeholder.toLowerCase();
    if (!SKIP_PNL.has(stakeholderLower)) {
      const condition = await context.Condition.get(event.params.conditionId);
      if (condition) {
        for (const positionId of condition.positionIds) {
          await updateUserPositionWithSell(
            context,
            event.params.stakeholder,
            positionId,
            FIFTY_CENTS,
            event.params.amount,
          );
        }
      }
    }
};

const onPayoutRedemption = async ({ event, context }: any) => {
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

    // PnL: redeem = sell full position at payout price (V1 parity)
    const redeemerLower = event.params.redeemer.toLowerCase();
    if (!SKIP_PNL.has(redeemerLower)) {
      const condition = await context.Condition.get(event.params.conditionId);
      if (condition && condition.payoutDenominator !== 0n) {
        for (let i = 0; i < condition.positionIds.length; i++) {
          const positionId = condition.positionIds[i]!;
          const userPosition = await loadOrCreateUserPosition(
            context,
            event.params.redeemer,
            positionId,
          );
          const price =
            (condition.payoutNumerators[i]! * COLLATERAL_SCALE) /
            condition.payoutDenominator;
          await updateUserPositionWithSell(
            context,
            event.params.redeemer,
            positionId,
            price,
            userPosition.amount,
          );
        }
      }
    }
};

for (const contract of [
  "CtfCollateralAdapter",
  "NegRiskCtfCollateralAdapter",
] as const) {
  indexer.onEvent({ contract, event: "PositionSplit" }, onPositionSplit);
  indexer.onEvent({ contract, event: "PositionsMerge" }, onPositionsMerge);
  indexer.onEvent({ contract, event: "PayoutRedemption" }, onPayoutRedemption);
}

// ── V2 adapter ERC1155 flows (user attribution) ─────────────────────
//
// The V2 adapters never emit their own PositionSplit/Merge/Redemption events
// in practice — all real flow is CTF-level events with the adapter as
// stakeholder/redeemer (skipped in the ConditionalTokens handler). The only
// user-attributed signal is the ERC1155 transfer between user and adapter:
//   user -> adapter: surrender for redemption (resolved condition, sell at
//                    payout price) or merge (unresolved, sell at 50c)
//   adapter -> user: direct split via adapter (buy at 50c)
// Exchange-mediated hops (adapter <-> exchange) and mints/burns (0x0) are
// excluded; those trades are booked per-maker via CTFExchangeV2 OrderFilled.

// Checksummed for the `where` topic filters — envio compares filter values
// against EIP-55 checksummed decoded params, so lowercase values never match.
const V2_ADAPTER_ADDRS = [
  CTF_COLLATERAL_ADAPTER,
  NEG_RISK_CTF_COLLATERAL_ADAPTER,
].map((a) => getAddress(a));
const V2_ADAPTERS = new Set<string>(
  V2_ADAPTER_ADDRS.map((a) => a.toLowerCase()),
);
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const NON_USER_PARTIES = new Set([
  ...V2_EXCHANGES.map((a) => a.toLowerCase()),
  ...V2_ADAPTERS,
  ZERO_ADDR,
]);

// V2 adapters deployed at block 84902320 — no need to scan earlier history
const V2_START_BLOCK = 84_902_320;

async function handleAdapterTokenFlow(
  context: any,
  from: string,
  to: string,
  ids: readonly bigint[],
  values: readonly bigint[],
): Promise<void> {
  const fromLower = from.toLowerCase();
  const toLower = to.toLowerCase();

  if (V2_ADAPTERS.has(toLower) && !NON_USER_PARTIES.has(fromLower)) {
    // User surrenders tokens to the adapter: redemption or merge
    for (let i = 0; i < ids.length; i++) {
      const tokenId = ids[i]!;
      const value = values[i]!;
      if (value === 0n) continue;

      const position = await context.Position.get(tokenId.toString());
      const condition = position
        ? await context.Condition.get(position.condition)
        : undefined;
      if (!condition) continue;

      const outcomeIndex = Number(position.outcomeIndex);
      const price =
        condition.payoutDenominator > 0n
          ? (condition.payoutNumerators[outcomeIndex]! * COLLATERAL_SCALE) /
            condition.payoutDenominator
          : FIFTY_CENTS;
      await updateUserPositionWithSell(context, from, tokenId, price, value);
    }
  } else if (V2_ADAPTERS.has(fromLower) && !NON_USER_PARTIES.has(toLower)) {
    // Adapter sends freshly split tokens to a user: buy at 50c (V1 parity)
    for (let i = 0; i < ids.length; i++) {
      const value = values[i]!;
      if (value === 0n) continue;
      await updateUserPositionWithBuy(
        context,
        to,
        ids[i]!,
        FIFTY_CENTS,
        value,
      );
    }
  }
}

indexer.onEvent(
  {
    contract: "ConditionalTokens",
    event: "TransferSingle",
    where: {
      params: [
        { from: V2_ADAPTER_ADDRS },
        { to: V2_ADAPTER_ADDRS },
      ],
      block: { number: { _gte: V2_START_BLOCK } },
    },
  },
  async ({ event, context }) => {
    await handleAdapterTokenFlow(
      context,
      event.params.from,
      event.params.to,
      [event.params.id],
      [event.params.value],
    );
  },
);

indexer.onEvent(
  {
    contract: "ConditionalTokens",
    event: "TransferBatch",
    where: {
      params: [
        { from: V2_ADAPTER_ADDRS },
        { to: V2_ADAPTER_ADDRS },
      ],
      block: { number: { _gte: V2_START_BLOCK } },
    },
  },
  async ({ event, context }) => {
    await handleAdapterTokenFlow(
      context,
      event.params.from,
      event.params.to,
      event.params.ids,
      event.params.values,
    );
  },
);

// ── NegRiskCtfCollateralAdapter — Wrapped/Unwrapped specific to neg-risk ─
// These events flow through the same V2PolyUSDWrap stream (same signature) so
// they join with regular pUSD wraps at the query layer. Use ExchangeStats-style
// attribution by tracking isNegRisk at the adapter level.

indexer.onEvent(
  { contract: "NegRiskCtfCollateralAdapter", event: "Wrapped" },
  async ({ event, context }) => {
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
  },
);

indexer.onEvent(
  { contract: "NegRiskCtfCollateralAdapter", event: "Unwrapped" },
  async ({ event, context }) => {
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
  },
);
