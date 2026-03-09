import { describe, it, expect } from "vitest";
import {
  MockDb,
  NegRiskAdapter,
  Addresses,
  MOCK_CONDITION_ID,
  seedNegRiskEvent,
  seedUserPosition,
} from "../helpers/test-utils.js";
import {
  getNegRiskQuestionId,
  getConditionId,
  getNegRiskPositionId,
} from "../../utils/negRisk.js";
import { NEG_RISK_ADAPTER } from "../../utils/constants.js";

describe("NegRiskAdapter - MarketPrepared", () => {
  it("should create NegRiskEvent entity", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000005555";

    const mockEvent = NegRiskAdapter.MarketPrepared.createMockEvent({
      marketId,
      oracle: Addresses.mockAddresses[0]!,
      feeBips: 100n,
      data: "0x",
    });

    const result = await NegRiskAdapter.MarketPrepared.processEvent({
      event: mockEvent,
      mockDb,
    });

    const negRiskEvent = result.entities.NegRiskEvent.get(marketId);
    expect(negRiskEvent).toBeDefined();
    expect(negRiskEvent!.feeBps).toBe(100n);
    expect(negRiskEvent!.questionCount).toBe(0n);
  });
});

describe("NegRiskAdapter - QuestionPrepared", () => {
  it("should increment questionCount", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000005555";

    const seededDb = mockDb.entities.NegRiskEvent.set({
      id: marketId,
      feeBps: 100n,
      questionCount: 0n,
    });

    const mockEvent = NegRiskAdapter.QuestionPrepared.createMockEvent({
      marketId,
      questionId:
        "0x0000000000000000000000000000000000000000000000000000000000006666",
      index: 0n,
      data: "0x",
    });

    const result = await NegRiskAdapter.QuestionPrepared.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const negRiskEvent = result.entities.NegRiskEvent.get(marketId);
    expect(negRiskEvent!.questionCount).toBe(1n);
  });
});

describe("NegRiskAdapter - PositionSplit", () => {
  it("should create Split and update OI", async () => {
    const mockDb = MockDb.createMockDb();
    const seededDb = mockDb.entities.Condition.set({ id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [], payoutDenominator: 0n });

    const mockEvent = NegRiskAdapter.PositionSplit.createMockEvent({
      stakeholder: Addresses.mockAddresses[0]!,
      conditionId: MOCK_CONDITION_ID,
      amount: 1_000_000n,
    });

    const result = await NegRiskAdapter.PositionSplit.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const splits = result.entities.Split.getAll();
    expect(splits.length).toBe(1);

    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI!.amount).toBe(1_000_000n);
  });
});

describe("NegRiskAdapter - PositionsConverted", () => {
  it("should create NegRiskConversion entity", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000005555";

    const seededDb = mockDb.entities.NegRiskEvent.set({
      id: marketId,
      feeBps: 0n,
      questionCount: 3n,
    });

    const mockEvent = NegRiskAdapter.PositionsConverted.createMockEvent({
      stakeholder: Addresses.mockAddresses[0]!,
      marketId,
      indexSet: 7n, // binary 111 = all 3 questions
      amount: 1_000_000n,
    });

    const result = await NegRiskAdapter.PositionsConverted.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const conversions = result.entities.NegRiskConversion.getAll();
    expect(conversions.length).toBe(1);
    expect(conversions[0]!.amount).toBe(1_000_000n);
    expect(conversions[0]!.questionCount).toBe(3n);
  });
});

describe("NegRiskAdapter - QuestionPrepared multiple", () => {
  it("should increment questionCount for each question", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId = "0x0000000000000000000000000000000000000000000000000000000000005555";

    let db = mockDb.entities.NegRiskEvent.set({ id: marketId, feeBps: 100n, questionCount: 0n });

    for (let i = 0; i < 3; i++) {
      const ev = NegRiskAdapter.QuestionPrepared.createMockEvent({
        marketId,
        questionId: `0x000000000000000000000000000000000000000000000000000000000000666${i}`,
        index: BigInt(i),
        data: "0x",
      });
      db = await NegRiskAdapter.QuestionPrepared.processEvent({ event: ev, mockDb: db });
    }

    expect(db.entities.NegRiskEvent.get(marketId)!.questionCount).toBe(3n);
  });
});

describe("NegRiskAdapter - PositionsMerge", () => {
  it("should create Merge and decrease OI", async () => {
    const mockDb = MockDb.createMockDb();

    let seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [], payoutDenominator: 0n,
    });
    seededDb = seededDb.entities.MarketOpenInterest.set({ id: MOCK_CONDITION_ID, amount: 5_000_000n });
    seededDb = seededDb.entities.GlobalOpenInterest.set({ id: "", amount: 5_000_000n });

    const mockEvent = NegRiskAdapter.PositionsMerge.createMockEvent({
      stakeholder: Addresses.mockAddresses[0]!,
      conditionId: MOCK_CONDITION_ID,
      amount: 2_000_000n,
    });

    const result = await NegRiskAdapter.PositionsMerge.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    expect(result.entities.Merge.getAll().length).toBe(1);
    expect(result.entities.Merge.getAll()[0]!.amount).toBe(2_000_000n);
    expect(result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID)!.amount).toBe(3_000_000n);
    expect(result.entities.GlobalOpenInterest.get("")!.amount).toBe(3_000_000n);
  });

  it("should skip Merge entity for NegRiskExchange stakeholder", async () => {
    const mockDb = MockDb.createMockDb();
    const NEG_RISK_EXCHANGE_ADDR = "0xC5d563A36AE78145C45a50134d48A1215220f80a";

    let seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [], payoutDenominator: 0n,
    });
    seededDb = seededDb.entities.MarketOpenInterest.set({ id: MOCK_CONDITION_ID, amount: 5_000_000n });
    seededDb = seededDb.entities.GlobalOpenInterest.set({ id: "", amount: 5_000_000n });

    const mockEvent = NegRiskAdapter.PositionsMerge.createMockEvent({
      stakeholder: NEG_RISK_EXCHANGE_ADDR,
      conditionId: MOCK_CONDITION_ID,
      amount: 1_000_000n,
    });

    const result = await NegRiskAdapter.PositionsMerge.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    expect(result.entities.Merge.getAll().length).toBe(0);
    expect(result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID)!.amount).toBe(4_000_000n);
  });
});

describe("NegRiskAdapter - PayoutRedemption", () => {
  it("should create Redemption and decrease OI", async () => {
    const mockDb = MockDb.createMockDb();

    let seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [1n, 0n], payoutDenominator: 1n,
    });
    seededDb = seededDb.entities.MarketOpenInterest.set({ id: MOCK_CONDITION_ID, amount: 3_000_000n });
    seededDb = seededDb.entities.GlobalOpenInterest.set({ id: "", amount: 3_000_000n });

    const mockEvent = NegRiskAdapter.PayoutRedemption.createMockEvent({
      redeemer: Addresses.mockAddresses[0]!,
      conditionId: MOCK_CONDITION_ID,
      amounts: [1_000_000n, 0n],
      payout: 1_000_000n,
    });

    const result = await NegRiskAdapter.PayoutRedemption.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const redemptions = result.entities.Redemption.getAll();
    expect(redemptions.length).toBe(1);
    expect(redemptions[0]!.payout).toBe(1_000_000n);
    expect(redemptions[0]!.indexSets).toEqual([1n, 2n]);
    expect(result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID)!.amount).toBe(2_000_000n);
  });
});

// ============================================================
// Test #7: PositionsConverted with feeBps > 0
// ============================================================

describe("NegRiskAdapter - PositionsConverted with feeBps > 0", () => {
  it("should apply fee adjustment to OI reduction", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000005555";
    const stakeholder = Addresses.mockAddresses[0]!;

    // Set up NegRiskEvent with feeBps=200 (2%) and questionCount=3
    let db = mockDb.entities.NegRiskEvent.set({
      id: marketId,
      feeBps: 200n,
      questionCount: 3n,
    });

    // Seed conditions for all 3 questions so OI can be tracked
    const conditionIds: string[] = [];
    for (let qi = 0; qi < 3; qi++) {
      const questionId = getNegRiskQuestionId(marketId as `0x${string}`, qi);
      const conditionId = getConditionId(
        NEG_RISK_ADAPTER as `0x${string}`,
        questionId,
      ).toLowerCase();
      conditionIds.push(conditionId);

      db = db.entities.Condition.set({
        id: conditionId,
        positionIds: [BigInt(qi * 2), BigInt(qi * 2 + 1)],
        payoutNumerators: [],
        payoutDenominator: 0n,
      });
      db = db.entities.MarketOpenInterest.set({
        id: conditionId,
        amount: 10_000_000n,
      });
    }
    db = db.entities.GlobalOpenInterest.set({ id: "", amount: 30_000_000n });

    // Seed user positions for NO tokens so sell works
    for (let qi = 0; qi < 3; qi++) {
      const noPositionId = getNegRiskPositionId(
        marketId as `0x${string}`,
        qi,
        1, // NO_INDEX
      );
      db = db.entities.UserPosition.set({
        id: `${stakeholder}-${noPositionId}`,
        user: stakeholder,
        tokenId: noPositionId,
        amount: 5_000_000n,
        avgPrice: 500_000n,
        realizedPnl: 0n,
        totalBought: 5_000_000n,
      });
    }

    // indexSet=7 (binary 111 = all 3 questions are NO)
    const mockEvent = NegRiskAdapter.PositionsConverted.createMockEvent({
      stakeholder,
      marketId,
      indexSet: 7n,
      amount: 1_000_000n,
    });

    const result = await NegRiskAdapter.PositionsConverted.processEvent({
      event: mockEvent,
      mockDb: db,
    });

    // noCount=3, multiplier=2, divisor=3
    // feeAmount = 1_000_000 * 200 / 10_000 = 20_000
    // amount after fee = 1_000_000 - 20_000 = 980_000
    // feeReleased = -(20_000 * 2) = -40_000 total across all conditions
    // collateralReleased = -(980_000 * 2) = -1_960_000 total
    // Total global OI change = -40_000 + -1_960_000 = -2_000_000
    const globalOI = result.entities.GlobalOpenInterest.get("");
    expect(globalOI).toBeDefined();
    expect(globalOI!.amount).toBe(30_000_000n - 2_000_000n);

    // Each condition's OI should decrease by (feeReleased/3 + collateralReleased/3)
    // = (-40_000/3) + (-1_960_000/3) = -13_333 + -653_333 = -666_666
    for (const cId of conditionIds) {
      const oi = result.entities.MarketOpenInterest.get(cId);
      expect(oi).toBeDefined();
      expect(oi!.amount).toBe(10_000_000n - 666_666n);
    }

    // NegRiskConversion should be created
    const conversions = result.entities.NegRiskConversion.getAll();
    expect(conversions.length).toBe(1);
  });
});

// ============================================================
// Test #8: PositionsConverted YES-buy branch
// ============================================================

describe("NegRiskAdapter - PositionsConverted YES-buy branch", () => {
  it("should buy YES positions when indexSet does not cover all questions", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000005555";
    const stakeholder = Addresses.mockAddresses[0]!;

    // questionCount=3, indexSet=3 (binary 011) means questions 0 and 1 are NO, question 2 is YES
    let db = mockDb.entities.NegRiskEvent.set({
      id: marketId,
      feeBps: 0n,
      questionCount: 3n,
    });

    // Seed conditions for all 3 questions
    for (let qi = 0; qi < 3; qi++) {
      const questionId = getNegRiskQuestionId(marketId as `0x${string}`, qi);
      const conditionId = getConditionId(
        NEG_RISK_ADAPTER as `0x${string}`,
        questionId,
      ).toLowerCase();

      db = db.entities.Condition.set({
        id: conditionId,
        positionIds: [BigInt(qi * 2), BigInt(qi * 2 + 1)],
        payoutNumerators: [],
        payoutDenominator: 0n,
      });
      db = db.entities.MarketOpenInterest.set({
        id: conditionId,
        amount: 10_000_000n,
      });
    }
    db = db.entities.GlobalOpenInterest.set({ id: "", amount: 30_000_000n });

    // Seed user positions for NO tokens on questions 0 and 1
    for (let qi = 0; qi < 2; qi++) {
      const noPositionId = getNegRiskPositionId(
        marketId as `0x${string}`,
        qi,
        1, // NO_INDEX
      );
      db = db.entities.UserPosition.set({
        id: `${stakeholder}-${noPositionId}`,
        user: stakeholder,
        tokenId: noPositionId,
        amount: 5_000_000n,
        avgPrice: 500_000n,
        realizedPnl: 0n,
        totalBought: 5_000_000n,
      });
    }

    const mockEvent = NegRiskAdapter.PositionsConverted.createMockEvent({
      stakeholder,
      marketId,
      indexSet: 3n, // binary 011 = questions 0 and 1
      amount: 1_000_000n,
    });

    const result = await NegRiskAdapter.PositionsConverted.processEvent({
      event: mockEvent,
      mockDb: db,
    });

    // noCount=2, questionCount=3, so there's 1 YES position (question 2)
    // noPrice = (500_000 + 500_000) / 2 = 500_000
    // yesPrice = (500_000 * 2 - 1_000_000 * (2-1)) / (3-2) = (1_000_000 - 1_000_000) / 1 = 0
    // YES position for question 2, outcome 0 (YES_INDEX=0)
    const yesPositionId = getNegRiskPositionId(
      marketId as `0x${string}`,
      2,
      0, // YES_INDEX
    );
    const yesPos = result.entities.UserPosition.get(`${stakeholder}-${yesPositionId}`);
    expect(yesPos).toBeDefined();
    expect(yesPos!.amount).toBe(1_000_000n);

    // OI: noCount=2 > 1, multiplier=1, divisor=2, feeBps=0
    // collateralReleased = -(1_000_000 * 1) = -1_000_000 total
    const globalOI = result.entities.GlobalOpenInterest.get("");
    expect(globalOI!.amount).toBe(29_000_000n);
  });
});

// ============================================================
// Test #13: PayoutRedemption with payoutDenominator === 0n
// ============================================================

describe("NegRiskAdapter - PayoutRedemption with payoutDenominator === 0n", () => {
  it("should create Redemption and decrease OI but skip PnL", async () => {
    const mockDb = MockDb.createMockDb();
    const user = Addresses.mockAddresses[0]!;

    let seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });
    seededDb = seededDb.entities.UserPosition.set({
      id: `${user}-100`, user, tokenId: 100n,
      amount: 1_000_000n, avgPrice: 600_000n, realizedPnl: 0n, totalBought: 1_000_000n,
    });
    seededDb = seededDb.entities.UserPosition.set({
      id: `${user}-101`, user, tokenId: 101n,
      amount: 1_000_000n, avgPrice: 400_000n, realizedPnl: 0n, totalBought: 1_000_000n,
    });
    seededDb = seededDb.entities.MarketOpenInterest.set({ id: MOCK_CONDITION_ID, amount: 2_000_000n });
    seededDb = seededDb.entities.GlobalOpenInterest.set({ id: "", amount: 2_000_000n });

    const mockEvent = NegRiskAdapter.PayoutRedemption.createMockEvent({
      redeemer: user,
      conditionId: MOCK_CONDITION_ID,
      amounts: [1_000_000n, 0n],
      payout: 1_000_000n,
    });

    const result = await NegRiskAdapter.PayoutRedemption.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // Redemption should be created (NegRiskAdapter always creates Redemption)
    const redemptions = result.entities.Redemption.getAll();
    expect(redemptions.length).toBe(1);

    // OI should decrease
    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI!.amount).toBe(1_000_000n);

    // PnL should NOT be computed (payoutDenominator === 0n)
    const pos0 = result.entities.UserPosition.get(`${user}-100`);
    expect(pos0!.realizedPnl).toBe(0n);
    expect(pos0!.amount).toBe(1_000_000n);
  });
});

// ============================================================
// Test #14: QuestionPrepared with missing NegRiskEvent
// ============================================================

describe("NegRiskAdapter - QuestionPrepared with missing NegRiskEvent", () => {
  it("should be a graceful no-op when NegRiskEvent does not exist", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId =
      "0x0000000000000000000000000000000000000000000000000000000000009999";

    const mockEvent = NegRiskAdapter.QuestionPrepared.createMockEvent({
      marketId,
      questionId:
        "0x0000000000000000000000000000000000000000000000000000000000006666",
      index: 0n,
      data: "0x",
    });

    const result = await NegRiskAdapter.QuestionPrepared.processEvent({
      event: mockEvent,
      mockDb,
    });

    // No NegRiskEvent should exist (none was seeded, none should be created)
    const negRiskEvent = result.entities.NegRiskEvent.get(marketId);
    expect(negRiskEvent).toBeUndefined();
  });
});
