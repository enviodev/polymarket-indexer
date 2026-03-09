import { describe, it, expect } from "vitest";
import {
  MockDb,
  Exchange,
  ConditionalTokens,
  Addresses,
  MOCK_CONDITION_ID,
} from "../helpers/test-utils.js";

describe("PnL - Exchange OrderFilled", () => {
  it("should create UserPosition on buy order fill", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 0n, // Buy: maker sends USDC
      takerAssetId: 42n, // Buy: taker sends tokens
      makerAmountFilled: 500_000n, // 0.5 USDC
      takerAmountFilled: 1_000_000n, // 1 token
      fee: 10_000n,
    });

    const result = await Exchange.OrderFilled.processEvent({
      event: mockEvent,
      mockDb,
    });

    // UserPosition should be created for the buyer
    const positions = result.entities.UserPosition.getAll();
    expect(positions.length).toBe(1);
    const pos = positions[0]!;
    expect(pos.user).toBe(Addresses.mockAddresses[0]!);
    expect(pos.tokenId).toBe(42n);
    expect(pos.amount).toBe(1_000_000n);
    // Price = 500_000 * 1_000_000 / 1_000_000 = 500_000 (0.5 USDC)
    expect(pos.avgPrice).toBe(500_000n);
    expect(pos.realizedPnl).toBe(0n);
  });
});

describe("PnL - ConditionalTokens ConditionResolution", () => {
  it("should store payout numerators on Condition", async () => {
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
      payoutNumerators: [1n, 0n],
    });

    const result = await ConditionalTokens.ConditionResolution.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const condition = result.entities.Condition.get(MOCK_CONDITION_ID);
    expect(condition).toBeDefined();
    expect(condition!.payoutNumerators).toEqual([1n, 0n]);
    expect(condition!.payoutDenominator).toBe(1n);
  });
});

describe("PnL - UserPosition averaging", () => {
  it("should compute weighted average price across multiple buys", async () => {
    const mockDb = MockDb.createMockDb();

    // First buy: 1 token at 0.5
    const event1 = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 0n,
      takerAssetId: 42n,
      makerAmountFilled: 500_000n,
      takerAmountFilled: 1_000_000n,
      fee: 0n,
    });

    const result1 = await Exchange.OrderFilled.processEvent({
      event: event1,
      mockDb,
    });

    // Second buy: 1 token at 0.8
    const event2 = Exchange.OrderFilled.createMockEvent({
      orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 0n,
      takerAssetId: 42n,
      makerAmountFilled: 800_000n,
      takerAmountFilled: 1_000_000n,
      fee: 0n,
    });

    const result2 = await Exchange.OrderFilled.processEvent({
      event: event2,
      mockDb: result1,
    });

    const pos = result2.entities.UserPosition.get(
      `${Addresses.mockAddresses[0]!}-42`,
    );
    expect(pos).toBeDefined();
    expect(pos!.amount).toBe(2_000_000n);
    // avgPrice = (500_000 * 1_000_000 + 800_000 * 1_000_000) / 2_000_000 = 650_000
    expect(pos!.avgPrice).toBe(650_000n);
    expect(pos!.totalBought).toBe(2_000_000n);
  });

  it("should compute realized PnL on sell", async () => {
    const mockDb = MockDb.createMockDb();

    // Seed position: 2 tokens at avg price 0.5
    const seededDb = mockDb.entities.UserPosition.set({
      id: `${Addresses.mockAddresses[0]!}-42`,
      user: Addresses.mockAddresses[0]!,
      tokenId: 42n,
      amount: 2_000_000n,
      avgPrice: 500_000n,
      realizedPnl: 0n,
      totalBought: 2_000_000n,
    });

    // Sell: 1 token at 0.8
    const event = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 42n, // Sell: maker sends tokens
      takerAssetId: 0n,
      makerAmountFilled: 1_000_000n,
      takerAmountFilled: 800_000n,
      fee: 0n,
    });

    const result = await Exchange.OrderFilled.processEvent({
      event,
      mockDb: seededDb,
    });

    const pos = result.entities.UserPosition.get(
      `${Addresses.mockAddresses[0]!}-42`,
    );
    expect(pos).toBeDefined();
    expect(pos!.amount).toBe(1_000_000n); // 2 - 1 = 1
    // realizedPnl = 1_000_000 * (800_000 - 500_000) / 1_000_000 = 300_000
    expect(pos!.realizedPnl).toBe(300_000n);
  });
});

describe("PnL - sell capped at position size", () => {
  it("should cap sell amount to current position", async () => {
    const mockDb = MockDb.createMockDb();

    const seededDb = mockDb.entities.UserPosition.set({
      id: `${Addresses.mockAddresses[0]!}-42`,
      user: Addresses.mockAddresses[0]!,
      tokenId: 42n,
      amount: 500_000n,
      avgPrice: 500_000n,
      realizedPnl: 0n,
      totalBought: 500_000n,
    });

    const event = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 42n,
      takerAssetId: 0n,
      makerAmountFilled: 1_000_000n,
      takerAmountFilled: 800_000n,
      fee: 0n,
    });

    const result = await Exchange.OrderFilled.processEvent({ event, mockDb: seededDb });

    const pos = result.entities.UserPosition.get(`${Addresses.mockAddresses[0]!}-42`);
    expect(pos!.amount).toBe(0n);
    // pnl = 500_000 * (800_000 - 500_000) / 1_000_000 = 150_000
    expect(pos!.realizedPnl).toBe(150_000n);
  });
});

describe("PnL - multiple sells accumulate realizedPnl", () => {
  it("should accumulate realized PnL across multiple sells", async () => {
    const mockDb = MockDb.createMockDb();

    const seededDb = mockDb.entities.UserPosition.set({
      id: `${Addresses.mockAddresses[0]!}-42`,
      user: Addresses.mockAddresses[0]!,
      tokenId: 42n,
      amount: 3_000_000n,
      avgPrice: 400_000n,
      realizedPnl: 0n,
      totalBought: 3_000_000n,
    });

    // Sell 1 at 0.7 => pnl = 300_000
    const sell1 = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 42n, takerAssetId: 0n,
      makerAmountFilled: 1_000_000n, takerAmountFilled: 700_000n, fee: 0n,
    });
    const result1 = await Exchange.OrderFilled.processEvent({ event: sell1, mockDb: seededDb });

    expect(result1.entities.UserPosition.get(`${Addresses.mockAddresses[0]!}-42`)!.amount).toBe(2_000_000n);
    expect(result1.entities.UserPosition.get(`${Addresses.mockAddresses[0]!}-42`)!.realizedPnl).toBe(300_000n);

    // Sell 1 at 0.3 => pnl = -100_000, total = 200_000
    const sell2 = Exchange.OrderFilled.createMockEvent({
      orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 42n, takerAssetId: 0n,
      makerAmountFilled: 1_000_000n, takerAmountFilled: 300_000n, fee: 0n,
    });
    const result2 = await Exchange.OrderFilled.processEvent({ event: sell2, mockDb: result1 });

    expect(result2.entities.UserPosition.get(`${Addresses.mockAddresses[0]!}-42`)!.amount).toBe(1_000_000n);
    expect(result2.entities.UserPosition.get(`${Addresses.mockAddresses[0]!}-42`)!.realizedPnl).toBe(200_000n);
  });
});
