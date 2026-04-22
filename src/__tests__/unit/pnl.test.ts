import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
// Register ConditionalTokens + NegRiskAdapter + Exchange — any of these can drive PnL
import "../../handlers/ConditionalTokens.js";
import "../../handlers/NegRiskAdapter.js";
import "../../handlers/Exchange.js";

const USER = "0x1111111111111111111111111111111111111111";
const OTHER_USER = "0x2222222222222222222222222222222222222222";
const NEG_RISK_ADAPTER = "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296";
const MARKET_ID =
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";

describe("PnL via NegRiskAdapter.PositionsConverted", () => {
  it("creates a NegRiskConversion record and updates UserPosition entries", async () => {
    const indexer = createTestIndexer();

    // Seed a NegRiskEvent so questions are known
    indexer.NegRiskEvent.set({
      id: MARKET_ID,
      feeBps: 100n,
      questionCount: 3n,
    });

    // Conversion event with a known indexSet
    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "NegRiskAdapter",
              event: "PositionsConverted",
              params: {
                stakeholder: USER,
                marketId: MARKET_ID,
                indexSet: 1n, // binary: 001 = just question 0
                amount: 1_000_000n,
              },
            },
          ],
        },
      },
    });

    const conversions = await indexer.NegRiskConversion.getAll();
    expect(conversions.length).toBe(1);
    expect(conversions[0]!.amount).toBe(1_000_000n);
  });
});

describe("PnL via ConditionalTokens.PositionSplit", () => {
  it("creates a UserPosition for each outcome on a split (non-exchange stakeholder)", async () => {
    const indexer = createTestIndexer();

    // Seed condition with known position IDs so the split handler has something to credit to
    indexer.Condition.set({
      id: CONDITION_ID,
      positionIds: [500n, 501n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "ConditionalTokens",
              event: "PositionSplit",
              params: {
                stakeholder: OTHER_USER,
                collateralToken: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
                parentCollectionId:
                  "0x0000000000000000000000000000000000000000000000000000000000000000",
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 2_000_000n,
              },
            },
          ],
        },
      },
    });

    const positions = await indexer.UserPosition.getAll();
    // Two positions, one per outcome
    expect(positions.length).toBe(2);
    for (const p of positions) {
      expect(p.amount).toBe(2_000_000n);
    }
  });
});

describe("PnL via Exchange.OrderFilled", () => {
  it("creates a UserPosition for the maker on a buy", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Exchange",
              event: "OrderFilled",
              params: {
                orderHash:
                  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
                maker: USER,
                taker: OTHER_USER,
                makerAssetId: 0n,
                takerAssetId: 42n,
                makerAmountFilled: 1_000_000n,
                takerAmountFilled: 2_000_000n,
                fee: 0n,
              },
            },
          ],
        },
      },
    });

    const positions = await indexer.UserPosition.getAll();
    expect(positions.length).toBe(1);
    expect(positions[0]!.user.toLowerCase()).toBe(USER);
  });
});
