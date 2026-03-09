import { describe, it, expect } from "vitest";
import {
  MockDb,
  ConditionalTokens,
  Addresses,
  MOCK_CONDITION_ID,
  MOCK_USDC,
  MOCK_PARENT_COLLECTION,
  seedFPMM,
} from "../helpers/test-utils.js";

describe("ConditionalTokens - ConditionPreparation", () => {
  it("should create Condition and Position entities for binary condition", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = ConditionalTokens.ConditionPreparation.createMockEvent({
      conditionId: MOCK_CONDITION_ID,
      oracle: Addresses.mockAddresses[0]!,
      questionId:
        "0x0000000000000000000000000000000000000000000000000000000000001111",
      outcomeSlotCount: 2n,
    });

    const result = await ConditionalTokens.ConditionPreparation.processEvent({
      event: mockEvent,
      mockDb,
    });

    const condition = result.entities.Condition.get(MOCK_CONDITION_ID);
    expect(condition).toBeDefined();

    // Should create 2 Position entities
    const positions = result.entities.Position.getAll();
    expect(positions.length).toBe(2);
  });

  it("should skip conditions with more than 2 outcomes", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = ConditionalTokens.ConditionPreparation.createMockEvent({
      conditionId: MOCK_CONDITION_ID,
      oracle: Addresses.mockAddresses[0]!,
      questionId:
        "0x0000000000000000000000000000000000000000000000000000000000001111",
      outcomeSlotCount: 3n,
    });

    const result = await ConditionalTokens.ConditionPreparation.processEvent({
      event: mockEvent,
      mockDb,
    });

    const condition = result.entities.Condition.get(MOCK_CONDITION_ID);
    expect(condition).toBeUndefined();
  });
});

describe("ConditionalTokens - PositionSplit", () => {
  it("should create Split entity and update OI for USDC split", async () => {
    const mockDb = MockDb.createMockDb();
    const seededDb = mockDb.entities.Condition.set({ id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [], payoutDenominator: 0n });

    const mockEvent = ConditionalTokens.PositionSplit.createMockEvent({
      stakeholder: Addresses.mockAddresses[0]!,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 1_000_000n,
    });

    const result = await ConditionalTokens.PositionSplit.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // Check Split was created
    const splits = result.entities.Split.getAll();
    expect(splits.length).toBe(1);
    expect(splits[0]!.amount).toBe(1_000_000n);

    // Check OI was updated
    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI).toBeDefined();
    expect(marketOI!.amount).toBe(1_000_000n);

    const globalOI = result.entities.GlobalOpenInterest.get("");
    expect(globalOI).toBeDefined();
    expect(globalOI!.amount).toBe(1_000_000n);
  });

  it("should skip Split for NegRiskAdapter stakeholder but still update OI", async () => {
    const mockDb = MockDb.createMockDb();
    const NEG_RISK_ADAPTER_ADDR = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";
    const seededDb = mockDb.entities.Condition.set({ id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [], payoutDenominator: 0n });

    const mockEvent = ConditionalTokens.PositionSplit.createMockEvent({
      stakeholder: NEG_RISK_ADAPTER_ADDR,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 500_000n,
    });

    const result = await ConditionalTokens.PositionSplit.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // No Split entity (NegRiskAdapter is in skip list)
    const splits = result.entities.Split.getAll();
    expect(splits.length).toBe(0);

    // OI should still be updated (USDC collateral)
    const globalOI = result.entities.GlobalOpenInterest.get("");
    expect(globalOI).toBeDefined();
    expect(globalOI!.amount).toBe(500_000n);
  });
});

describe("ConditionalTokens - PositionsMerge", () => {
  it("should create Merge entity and decrease OI", async () => {
    const mockDb = MockDb.createMockDb();
    let seededDb = mockDb.entities.Condition.set({ id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [], payoutDenominator: 0n });
    seededDb = seededDb.entities.MarketOpenInterest.set({
      id: MOCK_CONDITION_ID,
      amount: 2_000_000n,
    });
    seededDb = seededDb.entities.GlobalOpenInterest.set({
      id: "",
      amount: 2_000_000n,
    });

    const mockEvent = ConditionalTokens.PositionsMerge.createMockEvent({
      stakeholder: Addresses.mockAddresses[0]!,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 500_000n,
    });

    const result = await ConditionalTokens.PositionsMerge.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const merges = result.entities.Merge.getAll();
    expect(merges.length).toBe(1);

    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI!.amount).toBe(1_500_000n);

    const globalOI = result.entities.GlobalOpenInterest.get("");
    expect(globalOI!.amount).toBe(1_500_000n);
  });
});

describe("ConditionalTokens - PayoutRedemption", () => {
  it("should create Redemption entity and decrease OI", async () => {
    const mockDb = MockDb.createMockDb();
    let seededDb = mockDb.entities.Condition.set({ id: MOCK_CONDITION_ID, positionIds: [100n, 101n], payoutNumerators: [], payoutDenominator: 0n });
    seededDb = seededDb.entities.MarketOpenInterest.set({
      id: MOCK_CONDITION_ID,
      amount: 1_000_000n,
    });
    seededDb = seededDb.entities.GlobalOpenInterest.set({
      id: "",
      amount: 1_000_000n,
    });

    const mockEvent = ConditionalTokens.PayoutRedemption.createMockEvent({
      redeemer: Addresses.mockAddresses[0]!,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      indexSets: [1n, 2n],
      payout: 1_000_000n,
    });

    const result = await ConditionalTokens.PayoutRedemption.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const redemptions = result.entities.Redemption.getAll();
    expect(redemptions.length).toBe(1);
    expect(redemptions[0]!.payout).toBe(1_000_000n);

    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI!.amount).toBe(0n);
  });
});

describe("ConditionalTokens - OI accumulation", () => {
  it("should accumulate OI across multiple splits", async () => {
    const mockDb = MockDb.createMockDb();
    const seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    const event1 = ConditionalTokens.PositionSplit.createMockEvent({
      stakeholder: Addresses.mockAddresses[0]!,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 1_000_000n,
    });

    const result1 = await ConditionalTokens.PositionSplit.processEvent({
      event: event1,
      mockDb: seededDb,
    });

    const event2 = ConditionalTokens.PositionSplit.createMockEvent({
      stakeholder: Addresses.mockAddresses[1]!,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 2_000_000n,
    });

    const result2 = await ConditionalTokens.PositionSplit.processEvent({
      event: event2,
      mockDb: result1,
    });

    expect(result2.entities.MarketOpenInterest.get(MOCK_CONDITION_ID)!.amount).toBe(3_000_000n);
    expect(result2.entities.GlobalOpenInterest.get("")!.amount).toBe(3_000_000n);
    // Both splits created (mock events may share IDs so just check OI accumulation)
  });
});

describe("ConditionalTokens - non-USDC split skips OI", () => {
  it("should not update OI for non-USDC collateral", async () => {
    const mockDb = MockDb.createMockDb();
    const seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    const mockEvent = ConditionalTokens.PositionSplit.createMockEvent({
      stakeholder: Addresses.mockAddresses[0]!,
      collateralToken: "0x0000000000000000000000000000000000000001",
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 1_000_000n,
    });

    const result = await ConditionalTokens.PositionSplit.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    expect(result.entities.Split.getAll().length).toBe(1);
    expect(result.entities.GlobalOpenInterest.get("")).toBeUndefined();
  });
});

describe("ConditionalTokens - PositionSplit PnL tracking", () => {
  it("should create UserPositions at 50 cents for both outcomes on split", async () => {
    const mockDb = MockDb.createMockDb();
    const user = Addresses.mockAddresses[0]!;

    const seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    const mockEvent = ConditionalTokens.PositionSplit.createMockEvent({
      stakeholder: user,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 2_000_000n,
    });

    const result = await ConditionalTokens.PositionSplit.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const pos0 = result.entities.UserPosition.get(`${user}-100`);
    expect(pos0).toBeDefined();
    expect(pos0!.amount).toBe(2_000_000n);
    expect(pos0!.avgPrice).toBe(500_000n);

    const pos1 = result.entities.UserPosition.get(`${user}-101`);
    expect(pos1).toBeDefined();
    expect(pos1!.amount).toBe(2_000_000n);
    expect(pos1!.avgPrice).toBe(500_000n);
  });
});

describe("ConditionalTokens - PositionsMerge PnL", () => {
  it("should sell both outcomes at 50 cents on merge", async () => {
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
      amount: 1_000_000n, avgPrice: 400_000n, realizedPnl: 0n, totalBought: 1_000_000n,
    });
    seededDb = seededDb.entities.UserPosition.set({
      id: `${user}-101`, user, tokenId: 101n,
      amount: 1_000_000n, avgPrice: 400_000n, realizedPnl: 0n, totalBought: 1_000_000n,
    });
    seededDb = seededDb.entities.MarketOpenInterest.set({ id: MOCK_CONDITION_ID, amount: 1_000_000n });
    seededDb = seededDb.entities.GlobalOpenInterest.set({ id: "", amount: 1_000_000n });

    const mockEvent = ConditionalTokens.PositionsMerge.createMockEvent({
      stakeholder: user,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 500_000n,
    });

    const result = await ConditionalTokens.PositionsMerge.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // pnl = 500_000 * (500_000 - 400_000) / 1_000_000 = 50_000
    const pos0 = result.entities.UserPosition.get(`${user}-100`);
    expect(pos0!.amount).toBe(500_000n);
    expect(pos0!.realizedPnl).toBe(50_000n);

    const pos1 = result.entities.UserPosition.get(`${user}-101`);
    expect(pos1!.amount).toBe(500_000n);
    expect(pos1!.realizedPnl).toBe(50_000n);
  });
});

describe("ConditionalTokens - PayoutRedemption PnL", () => {
  it("should realize PnL at payout price on redemption", async () => {
    const mockDb = MockDb.createMockDb();
    const user = Addresses.mockAddresses[0]!;

    let seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [1n, 0n],
      payoutDenominator: 1n,
    });
    seededDb = seededDb.entities.UserPosition.set({
      id: `${user}-100`, user, tokenId: 100n,
      amount: 1_000_000n, avgPrice: 600_000n, realizedPnl: 0n, totalBought: 1_000_000n,
    });
    seededDb = seededDb.entities.UserPosition.set({
      id: `${user}-101`, user, tokenId: 101n,
      amount: 1_000_000n, avgPrice: 400_000n, realizedPnl: 0n, totalBought: 1_000_000n,
    });
    seededDb = seededDb.entities.MarketOpenInterest.set({ id: MOCK_CONDITION_ID, amount: 1_000_000n });
    seededDb = seededDb.entities.GlobalOpenInterest.set({ id: "", amount: 1_000_000n });

    const mockEvent = ConditionalTokens.PayoutRedemption.createMockEvent({
      redeemer: user,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      indexSets: [1n, 2n],
      payout: 1_000_000n,
    });

    const result = await ConditionalTokens.PayoutRedemption.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // Winner: sold at 1.0, bought at 0.6 => pnl = 400_000
    const pos0 = result.entities.UserPosition.get(`${user}-100`);
    expect(pos0!.realizedPnl).toBe(400_000n);
    expect(pos0!.amount).toBe(0n);

    // Loser: sold at 0.0, bought at 0.4 => pnl = -400_000
    const pos1 = result.entities.UserPosition.get(`${user}-101`);
    expect(pos1!.realizedPnl).toBe(-400_000n);
    expect(pos1!.amount).toBe(0n);
  });
});

describe("ConditionalTokens - ConditionResolution split payouts", () => {
  it("should compute correct denominator for non-trivial payouts", async () => {
    const mockDb = MockDb.createMockDb();
    const seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    const mockEvent = ConditionalTokens.ConditionResolution.createMockEvent({
      conditionId: MOCK_CONDITION_ID,
      oracle: Addresses.mockAddresses[0]!,
      questionId: "0x0000000000000000000000000000000000000000000000000000000000001111",
      outcomeSlotCount: 2n,
      payoutNumerators: [3n, 7n],
    });

    const result = await ConditionalTokens.ConditionResolution.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const condition = result.entities.Condition.get(MOCK_CONDITION_ID);
    expect(condition!.payoutNumerators).toEqual([3n, 7n]);
    expect(condition!.payoutDenominator).toBe(10n);
  });
});

// ============================================================
// Test #9: PositionSplit when stakeholder is FPMM
// ============================================================

describe("ConditionalTokens - PositionSplit when stakeholder is FPMM", () => {
  it("should NOT create a Split entity when stakeholder is a known FPMM", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    // Seed an FPMM entity so the handler detects it
    const seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);

    const mockEvent = ConditionalTokens.PositionSplit.createMockEvent({
      stakeholder: fpmmAddr,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 1_000_000n,
    });

    const result = await ConditionalTokens.PositionSplit.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // No Split entity should be created (handler checks FixedProductMarketMaker.get)
    const splits = result.entities.Split.getAll();
    expect(splits.length).toBe(0);

    // OI should still be updated (USDC collateral)
    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI).toBeDefined();
    expect(marketOI!.amount).toBe(1_000_000n);
  });
});

// ============================================================
// Test #10: PositionsMerge when stakeholder is FPMM
// ============================================================

describe("ConditionalTokens - PositionsMerge when stakeholder is FPMM", () => {
  it("should NOT create a Merge entity when stakeholder is a known FPMM", async () => {
    const fpmmAddr = Addresses.mockAddresses[0]!;
    const mockDb = MockDb.createMockDb();
    let seededDb = seedFPMM(mockDb, fpmmAddr, MOCK_CONDITION_ID);
    seededDb = seededDb.entities.MarketOpenInterest.set({
      id: MOCK_CONDITION_ID,
      amount: 5_000_000n,
    });
    seededDb = seededDb.entities.GlobalOpenInterest.set({
      id: "",
      amount: 5_000_000n,
    });

    const mockEvent = ConditionalTokens.PositionsMerge.createMockEvent({
      stakeholder: fpmmAddr,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      partition: [1n, 2n],
      amount: 1_000_000n,
    });

    const result = await ConditionalTokens.PositionsMerge.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // No Merge entity should be created
    const merges = result.entities.Merge.getAll();
    expect(merges.length).toBe(0);

    // OI should still decrease
    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI!.amount).toBe(4_000_000n);
  });
});

// ============================================================
// Test #11: PayoutRedemption when redeemer is NegRiskAdapter
// ============================================================

describe("ConditionalTokens - PayoutRedemption when redeemer is NegRiskAdapter", () => {
  it("should NOT create Redemption entity but still decrease OI", async () => {
    const mockDb = MockDb.createMockDb();
    const NEG_RISK_ADAPTER_ADDR = "0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296";

    let seededDb = mockDb.entities.Condition.set({
      id: MOCK_CONDITION_ID,
      positionIds: [100n, 101n],
      payoutNumerators: [1n, 0n],
      payoutDenominator: 1n,
    });
    seededDb = seededDb.entities.MarketOpenInterest.set({
      id: MOCK_CONDITION_ID,
      amount: 2_000_000n,
    });
    seededDb = seededDb.entities.GlobalOpenInterest.set({
      id: "",
      amount: 2_000_000n,
    });

    const mockEvent = ConditionalTokens.PayoutRedemption.createMockEvent({
      redeemer: NEG_RISK_ADAPTER_ADDR,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      indexSets: [1n, 2n],
      payout: 1_000_000n,
    });

    const result = await ConditionalTokens.PayoutRedemption.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // No Redemption entity (NegRiskAdapter is skipped)
    const redemptions = result.entities.Redemption.getAll();
    expect(redemptions.length).toBe(0);

    // OI should still decrease
    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI!.amount).toBe(1_000_000n);

    const globalOI = result.entities.GlobalOpenInterest.get("");
    expect(globalOI!.amount).toBe(1_000_000n);
  });
});

// ============================================================
// Test #12: PayoutRedemption with payoutDenominator === 0n
// ============================================================

describe("ConditionalTokens - PayoutRedemption with payoutDenominator === 0n", () => {
  it("should create Redemption and decrease OI but skip PnL computation", async () => {
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

    const mockEvent = ConditionalTokens.PayoutRedemption.createMockEvent({
      redeemer: user,
      collateralToken: MOCK_USDC,
      parentCollectionId: MOCK_PARENT_COLLECTION,
      conditionId: MOCK_CONDITION_ID,
      indexSets: [1n, 2n],
      payout: 1_000_000n,
    });

    const result = await ConditionalTokens.PayoutRedemption.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    // Redemption should be created
    const redemptions = result.entities.Redemption.getAll();
    expect(redemptions.length).toBe(1);

    // OI should decrease
    const marketOI = result.entities.MarketOpenInterest.get(MOCK_CONDITION_ID);
    expect(marketOI!.amount).toBe(1_000_000n);

    // UserPosition PnL should NOT be computed (payoutDenominator === 0n causes early return)
    const pos0 = result.entities.UserPosition.get(`${user}-100`);
    expect(pos0!.realizedPnl).toBe(0n);
    expect(pos0!.amount).toBe(1_000_000n);

    const pos1 = result.entities.UserPosition.get(`${user}-101`);
    expect(pos1!.realizedPnl).toBe(0n);
    expect(pos1!.amount).toBe(1_000_000n);
  });
});
