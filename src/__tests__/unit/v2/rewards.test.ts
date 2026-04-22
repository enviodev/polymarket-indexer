import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../../handlers/v2/Rewards.js";

const MARKET_ID =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const USER = "0x1111111111111111111111111111111111111111";
const SPONSOR = "0x2222222222222222222222222222222222222222";

describe("Rewards.DistributedRewards", () => {
  it("creates a V2RewardDistribution entity", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Rewards",
              event: "DistributedRewards",
              params: { user: USER, amount: 10_000n },
            },
          ],
        },
      },
    });

    const rewards = await indexer.V2RewardDistribution.getAll();
    expect(rewards.length).toBe(1);
    expect(rewards[0]!.user.toLowerCase()).toBe(USER);
    expect(rewards[0]!.amount).toBe(10_000n);
  });
});

describe("Rewards.MarketCreated + MarketClosed", () => {
  it("creates a V2SponsoredMarket with closed=false, then closes it", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Rewards",
              event: "MarketCreated",
              params: {
                marketId: MARKET_ID,
                startTime: 1714000000n,
                minSponsorDuration: 86400n,
                minSponsorAmount: 100_000_000n,
                marketData: "0xdeadbeef",
              },
            },
            {
              contract: "Rewards",
              event: "MarketClosed",
              params: { marketId: MARKET_ID, closedAt: 1714100000n },
            },
          ],
        },
      },
    });

    const market = await indexer.V2SponsoredMarket.get(MARKET_ID);
    expect(market!.closed).toBe(true);
    expect(market!.closedAt).toBe(1714100000);
    expect(market!.minSponsorAmount).toBe(100_000_000n);
  });

  it("creates a V2SponsoredMarket with closed=false from MarketCreated alone", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Rewards",
              event: "MarketCreated",
              params: {
                marketId: MARKET_ID,
                startTime: 1714000000n,
                minSponsorDuration: 86400n,
                minSponsorAmount: 100_000_000n,
                marketData: "0xdeadbeef",
              },
            },
          ],
        },
      },
    });

    const market = await indexer.V2SponsoredMarket.get(MARKET_ID);
    expect(market).toBeDefined();
    expect(market!.closed).toBe(false);
  });
});

describe("Rewards.Sponsored", () => {
  it("creates a V2Sponsorship linked to market_id", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Rewards",
              event: "Sponsored",
              params: {
                marketId: MARKET_ID,
                sponsor: SPONSOR,
                amount: 500_000n,
                startTime: 1714000000n,
                endTime: 1714086400n,
                ratePerMinute: 100n,
              },
            },
          ],
        },
      },
    });

    const sponsorships = await indexer.V2Sponsorship.getAll();
    expect(sponsorships.length).toBe(1);
    expect(sponsorships[0]!.sponsor.toLowerCase()).toBe(SPONSOR);
    expect(sponsorships[0]!.withdrawn).toBe(false);
    expect((sponsorships[0]! as any).market_id).toBe(MARKET_ID);
  });
});

describe("Rewards.MarketClosed on missing market", () => {
  it("no-ops when market does not exist", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Rewards",
              event: "MarketClosed",
              params: { marketId: MARKET_ID, closedAt: 1714100000n },
            },
          ],
        },
      },
    });

    const market = await indexer.V2SponsoredMarket.get(MARKET_ID);
    expect(market).toBeUndefined();
  });
});
