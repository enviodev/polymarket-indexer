import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../handlers/ConditionalTokens.js";

const ORACLE_REGULAR = "0x0000000000000000000000000000000000000001";
const NEG_RISK_ADAPTER = "0xd91e80cf2e7be2e162c6513ced06f1dd0da35296";
const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";
const STAKEHOLDER = "0x1111111111111111111111111111111111111111";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";
const QUESTION_ID =
  "0x4000000000000000000000000000000000000000000000000000000000000004";
const PARENT_COLLECTION =
  "0x0000000000000000000000000000000000000000000000000000000000000000";

describe("ConditionalTokens.ConditionPreparation", () => {
  it("creates a Condition entity and two Position entities for a binary condition", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "ConditionalTokens",
              event: "ConditionPreparation",
              params: {
                conditionId: CONDITION_ID,
                oracle: ORACLE_REGULAR,
                questionId: QUESTION_ID,
                outcomeSlotCount: 2n,
              },
            },
          ],
        },
      },
    });

    const condition = await indexer.Condition.get(CONDITION_ID);
    expect(condition).toBeDefined();
    expect(condition!.positionIds.length).toBe(2);

    const positions = await indexer.Position.getAll();
    expect(positions.length).toBe(2);
  });

  it("ignores non-binary conditions (outcomeSlotCount !== 2)", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "ConditionalTokens",
              event: "ConditionPreparation",
              params: {
                conditionId: CONDITION_ID,
                oracle: ORACLE_REGULAR,
                questionId: QUESTION_ID,
                outcomeSlotCount: 3n,
              },
            },
          ],
        },
      },
    });

    const condition = await indexer.Condition.get(CONDITION_ID);
    expect(condition).toBeUndefined();
  });
});

describe("ConditionalTokens.ConditionResolution", () => {
  it("stores payoutNumerators and payoutDenominator on existing Condition", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "ConditionalTokens",
              event: "ConditionPreparation",
              params: {
                conditionId: CONDITION_ID,
                oracle: ORACLE_REGULAR,
                questionId: QUESTION_ID,
                outcomeSlotCount: 2n,
              },
            },
            {
              contract: "ConditionalTokens",
              event: "ConditionResolution",
              params: {
                conditionId: CONDITION_ID,
                oracle: ORACLE_REGULAR,
                questionId: QUESTION_ID,
                outcomeSlotCount: 2n,
                payoutNumerators: [1n, 0n],
              },
            },
          ],
        },
      },
    });

    const condition = await indexer.Condition.get(CONDITION_ID);
    expect(condition!.payoutNumerators).toEqual([1n, 0n]);
    expect(condition!.payoutDenominator).toBe(1n);
  });
});

describe("ConditionalTokens.PositionSplit", () => {
  it("creates a Split entity and bumps MarketOpenInterest for USDC splits", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "ConditionalTokens",
              event: "ConditionPreparation",
              params: {
                conditionId: CONDITION_ID,
                oracle: ORACLE_REGULAR,
                questionId: QUESTION_ID,
                outcomeSlotCount: 2n,
              },
            },
            {
              contract: "ConditionalTokens",
              event: "PositionSplit",
              params: {
                stakeholder: STAKEHOLDER,
                collateralToken: USDC,
                parentCollectionId: PARENT_COLLECTION,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
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

    const globalOI = await indexer.GlobalOpenInterest.get("");
    expect(globalOI!.amount).toBe(1_000_000n);
  });

  it("does not create Activity when stakeholder is NegRiskAdapter", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "ConditionalTokens",
              event: "ConditionPreparation",
              params: {
                conditionId: CONDITION_ID,
                oracle: NEG_RISK_ADAPTER,
                questionId: QUESTION_ID,
                outcomeSlotCount: 2n,
              },
            },
            {
              contract: "ConditionalTokens",
              event: "PositionSplit",
              params: {
                stakeholder: NEG_RISK_ADAPTER,
                collateralToken: USDC,
                parentCollectionId: PARENT_COLLECTION,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 1_000_000n,
              },
            },
          ],
        },
      },
    });

    const splits = await indexer.Split.getAll();
    expect(splits.length).toBe(0);
  });
});
