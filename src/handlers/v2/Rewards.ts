import { Rewards } from "generated";
import { getEventKey } from "../../utils/negRisk.js";

// ── Reward Distribution ────────────────────────────────────────────

Rewards.DistributedRewards.handler(async ({ event, context }) => {
  context.V2RewardDistribution.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    user: event.params.user,
    amount: event.params.amount,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
    transactionHash: event.transaction.hash,
  });
});

// ── Market Sponsorship ─────────────────────────────────────────────

Rewards.MarketCreated.handler(async ({ event, context }) => {
  context.V2SponsoredMarket.set({
    id: event.params.marketId,
    startTime: Number(event.params.startTime),
    minSponsorDuration: Number(event.params.minSponsorDuration),
    minSponsorAmount: event.params.minSponsorAmount,
    marketData: event.params.marketData,
    closed: false,
    closedAt: undefined,
    createdAt: event.block.timestamp,
    createdAtBlock: event.block.number,
  });
});

Rewards.Sponsored.handler(async ({ event, context }) => {
  context.V2Sponsorship.set({
    id: getEventKey(event.chainId, event.block.number, event.logIndex),
    market_id: event.params.marketId,
    sponsor: event.params.sponsor,
    amount: event.params.amount,
    startTime: Number(event.params.startTime),
    endTime: Number(event.params.endTime),
    ratePerMinute: event.params.ratePerMinute,
    withdrawn: false,
    returnedAmount: undefined,
    consumedAmount: undefined,
    isEarlyWithdraw: undefined,
    timestamp: event.block.timestamp,
    blockNumber: event.block.number,
  });
});

Rewards.Withdrawn.handler(async ({ event, context }) => {
  context.log.info(
    `Withdrawal from market ${event.params.marketId} by ${event.params.sponsor}: returned=${event.params.returnedAmount} consumed=${event.params.consumedAmount} early=${event.params.isEarlyWithdraw}`,
  );
});

Rewards.MarketClosed.handler(async ({ event, context }) => {
  const market = await context.V2SponsoredMarket.get(event.params.marketId);
  if (!market) return;

  context.V2SponsoredMarket.set({
    ...market,
    closed: true,
    closedAt: Number(event.params.closedAt),
  });
});
