import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../handlers/NegRiskAdapter.js";

const MARKET_ID =
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const QUESTION_ID =
  "0x2000000000000000000000000000000000000000000000000000000000000002";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";
const ORACLE = "0x0000000000000000000000000000000000000001";
const STAKEHOLDER = "0x1111111111111111111111111111111111111111";

describe("NegRiskAdapter.MarketPrepared", () => {
  it("creates a NegRiskEvent entity", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "NegRiskAdapter",
              event: "MarketPrepared",
              params: {
                marketId: MARKET_ID,
                oracle: ORACLE,
                feeBips: 100n,
                data: "0x",
              },
            },
          ],
        },
      },
    });

    const event = await indexer.NegRiskEvent.get(MARKET_ID);
    expect(event).toBeDefined();
    expect(event!.feeBps).toBe(100n);
    expect(event!.questionCount).toBe(0n);
  });
});

describe("NegRiskAdapter.QuestionPrepared", () => {
  it("increments questionCount on an existing NegRiskEvent", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "NegRiskAdapter",
              event: "MarketPrepared",
              params: {
                marketId: MARKET_ID,
                oracle: ORACLE,
                feeBips: 100n,
                data: "0x",
              },
            },
            {
              contract: "NegRiskAdapter",
              event: "QuestionPrepared",
              params: {
                marketId: MARKET_ID,
                questionId: QUESTION_ID,
                index: 0n,
                data: "0x",
              },
            },
            {
              contract: "NegRiskAdapter",
              event: "QuestionPrepared",
              params: {
                marketId: MARKET_ID,
                questionId: QUESTION_ID,
                index: 1n,
                data: "0x",
              },
            },
          ],
        },
      },
    });

    const event = await indexer.NegRiskEvent.get(MARKET_ID);
    expect(event!.questionCount).toBe(2n);
  });

  it("no-ops when NegRiskEvent does not exist", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "NegRiskAdapter",
              event: "QuestionPrepared",
              params: {
                marketId: MARKET_ID,
                questionId: QUESTION_ID,
                index: 0n,
                data: "0x",
              },
            },
          ],
        },
      },
    });

    const event = await indexer.NegRiskEvent.get(MARKET_ID);
    expect(event).toBeUndefined();
  });
});

describe("NegRiskAdapter.PositionSplit", () => {
  it("creates a Split entity for regular stakeholder", async () => {
    const indexer = createTestIndexer();

    // Seed a condition so the OI branch runs (otherwise only Activity runs)
    indexer.Condition.set({
      id: CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "NegRiskAdapter",
              event: "PositionSplit",
              params: {
                stakeholder: STAKEHOLDER,
                conditionId: CONDITION_ID,
                amount: 1_000_000n,
              },
            },
          ],
        },
      },
    });

    const splits = await indexer.Split.getAll();
    expect(splits.length).toBe(1);
    expect(splits[0]!.amount).toBe(1_000_000n);

    const marketOI = await indexer.MarketOpenInterest.get(CONDITION_ID);
    expect(marketOI!.amount).toBe(1_000_000n);
  });
});
