import { PolyUSD } from "generated";
import { getEventKey } from "../../utils/negRisk.js";

const getOrInitStats = async (context: any) =>
  context.V2PolyUSDStats.getOrCreate({
    id: "polyusd",
    totalSupply: 0n,
    totalWrapped: 0n,
    totalUnwrapped: 0n,
    totalTransfers: 0n,
  });

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

// ── Transfers ──────────────────────────────────────────────────────

PolyUSD.Transfer.handler(async ({ event, context }) => {
  const stats = await getOrInitStats(context);
  const isMint = event.params.from === ZERO_ADDR;
  const isBurn = event.params.to === ZERO_ADDR;

  context.V2PolyUSDTransfer.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    from: event.params.from,
    to: event.params.to,
    amount: event.params.amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });

  if (!isMint) {
    const sender = await context.V2PolyUSDAccount.getOrCreate({
      id: event.params.from,
      balance: 0n,
      totalWrapped: 0n,
      totalUnwrapped: 0n,
    });
    context.V2PolyUSDAccount.set({
      ...sender,
      balance: sender.balance - event.params.amount,
    });
  }

  if (!isBurn) {
    const receiver = await context.V2PolyUSDAccount.getOrCreate({
      id: event.params.to,
      balance: 0n,
      totalWrapped: 0n,
      totalUnwrapped: 0n,
    });
    context.V2PolyUSDAccount.set({
      ...receiver,
      balance: receiver.balance + event.params.amount,
    });
  }

  context.V2PolyUSDStats.set({
    ...stats,
    totalSupply: isMint
      ? stats.totalSupply + event.params.amount
      : isBurn
        ? stats.totalSupply - event.params.amount
        : stats.totalSupply,
    totalTransfers: stats.totalTransfers + 1n,
  });
});

// ── Wrapping / Unwrapping ──────────────────────────────────────────

PolyUSD.Wrapped.handler(async ({ event, context }) => {
  const stats = await getOrInitStats(context);

  context.V2PolyUSDWrap.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    eventType: "wrap",
    caller: event.params.caller,
    asset: event.params.asset,
    to: event.params.to,
    txFrom: event.transaction.from ?? "",
    amount: event.params.amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });

  const account = await context.V2PolyUSDAccount.getOrCreate({
    id: event.params.to,
    balance: 0n,
    totalWrapped: 0n,
    totalUnwrapped: 0n,
  });
  context.V2PolyUSDAccount.set({
    ...account,
    totalWrapped: account.totalWrapped + event.params.amount,
  });

  context.V2PolyUSDStats.set({
    ...stats,
    totalWrapped: stats.totalWrapped + event.params.amount,
  });
});

PolyUSD.Unwrapped.handler(async ({ event, context }) => {
  const stats = await getOrInitStats(context);

  context.V2PolyUSDWrap.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    eventType: "unwrap",
    caller: event.params.caller,
    asset: event.params.asset,
    to: event.params.to,
    txFrom: event.transaction.from ?? "",
    amount: event.params.amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });

  const account = await context.V2PolyUSDAccount.getOrCreate({
    id: event.params.caller,
    balance: 0n,
    totalWrapped: 0n,
    totalUnwrapped: 0n,
  });
  context.V2PolyUSDAccount.set({
    ...account,
    totalUnwrapped: account.totalUnwrapped + event.params.amount,
  });

  context.V2PolyUSDStats.set({
    ...stats,
    totalUnwrapped: stats.totalUnwrapped + event.params.amount,
  });
});
