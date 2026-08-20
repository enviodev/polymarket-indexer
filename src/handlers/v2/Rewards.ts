import { indexer } from "envio";
import { getEventKey } from "../../utils/negRisk.js";

// ── Reward Distribution ────────────────────────────────────────────

indexer.onEvent(
  { contract: "Rewards", event: "DistributedRewards" },
  async ({ event, context }) => {
    context.V2RewardDistribution.set({
      id: getEventKey(event.block.number, event.logIndex),
      user: event.params.user,
      amount: event.params.amount,
      timestamp: event.block.timestamp,
      blockNumber: event.block.number,
      transactionHash: event.transaction.hash,
    });
  },
);

// ── Market Sponsorship ─────────────────────────────────────────────

indexer.onEvent(
  { contract: "Rewards", event: "MarketCreated" },
  async ({ event, context }) => {
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
  },
);

indexer.onEvent(
  { contract: "Rewards", event: "Sponsored" },
  async ({ event, context }) => {
    context.V2Sponsorship.set({
      id: getEventKey(event.block.number, event.logIndex),
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
  },
);

indexer.onEvent(
  { contract: "Rewards", event: "Withdrawn" },
  async ({ event, context }) => {
    // The event doesn't identify a specific sponsorship, but a withdrawal
    // drains the sponsor's whole stake in the market: mark all their open
    // sponsorships withdrawn and attach the amounts to the most recent one.
    const sponsorships = await context.V2Sponsorship.getWhere({
      sponsor: { _eq: event.params.sponsor },
    });
    const open = sponsorships
      .filter(
        (s: any) => s.market_id === event.params.marketId && !s.withdrawn,
      )
      .sort((a: any, b: any) => b.timestamp - a.timestamp);
    if (open.length === 0) {
      context.log.warn(
        `Withdrawn with no open sponsorship: market ${event.params.marketId} sponsor ${event.params.sponsor}`,
      );
      return;
    }

    const latest = open[0]!;
    const rest = open.slice(1);
    context.V2Sponsorship.set({
      ...latest,
      withdrawn: true,
      returnedAmount: event.params.returnedAmount,
      consumedAmount: event.params.consumedAmount,
      isEarlyWithdraw: event.params.isEarlyWithdraw,
    });
    for (const s of rest) {
      context.V2Sponsorship.set({ ...s, withdrawn: true });
    }
  },
);

indexer.onEvent(
  { contract: "Rewards", event: "MarketClosed" },
  async ({ event, context }) => {
    const market = await context.V2SponsoredMarket.get(event.params.marketId);
    if (!market) return;

    context.V2SponsoredMarket.set({
      ...market,
      closed: true,
      closedAt: Number(event.params.closedAt),
    });
  },
);
