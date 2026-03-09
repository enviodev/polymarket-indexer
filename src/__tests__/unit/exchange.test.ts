import { describe, it, expect } from "vitest";
import {
  MockDb,
  Exchange,
  Addresses,
} from "../helpers/test-utils.js";

describe("Exchange - OrderFilled", () => {
  it("should create an OrderFilledEvent and update Orderbook for a buy", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 0n, // Buy side
      takerAssetId: 42n,
      makerAmountFilled: 1_000_000n,
      takerAmountFilled: 500_000n,
      fee: 10_000n,
    });

    const result = await Exchange.OrderFilled.processEvent({
      event: mockEvent,
      mockDb,
    });

    // Check OrderFilledEvent was created
    const events = result.entities.OrderFilledEvent.getAll();
    expect(events.length).toBe(1);
    expect(events[0]!.makerAmountFilled).toBe(1_000_000n);

    // Check Orderbook was created/updated
    const orderbook = result.entities.Orderbook.get("42");
    expect(orderbook).toBeDefined();
    expect(orderbook!.tradesQuantity).toBe(1n);
    expect(orderbook!.buysQuantity).toBe(1n);
    expect(orderbook!.sellsQuantity).toBe(0n);
    expect(orderbook!.collateralVolume).toBe(1_000_000n);
    expect(orderbook!.collateralBuyVolume).toBe(1_000_000n);
  });

  it("should update Orderbook for a sell", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 42n, // Sell side (non-zero)
      takerAssetId: 0n,
      makerAmountFilled: 500_000n,
      takerAmountFilled: 1_000_000n,
      fee: 10_000n,
    });

    const result = await Exchange.OrderFilled.processEvent({
      event: mockEvent,
      mockDb,
    });

    const orderbook = result.entities.Orderbook.get("42");
    expect(orderbook).toBeDefined();
    expect(orderbook!.sellsQuantity).toBe(1n);
    expect(orderbook!.buysQuantity).toBe(0n);
    expect(orderbook!.collateralSellVolume).toBe(1_000_000n);
  });
});

describe("Exchange - OrdersMatched", () => {
  it("should create OrdersMatchedEvent and update global volume", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = Exchange.OrdersMatched.createMockEvent({
      takerOrderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      takerOrderMaker: Addresses.mockAddresses[0]!,
      makerAssetId: 0n,
      takerAssetId: 42n,
      makerAmountFilled: 1_000_000n,
      takerAmountFilled: 500_000n,
    });

    const result = await Exchange.OrdersMatched.processEvent({
      event: mockEvent,
      mockDb,
    });

    const events = result.entities.OrdersMatchedEvent.getAll();
    expect(events.length).toBe(1);

    const global = result.entities.OrdersMatchedGlobal.get("");
    expect(global).toBeDefined();
    expect(global!.tradesQuantity).toBe(1n);
  });
});

describe("Exchange - TokenRegistered", () => {
  it("should create MarketData entities for both tokens", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = Exchange.TokenRegistered.createMockEvent({
      token0: 100n,
      token1: 101n,
      conditionId: "0x0000000000000000000000000000000000000000000000000000000000003333",
    });

    const result = await Exchange.TokenRegistered.processEvent({
      event: mockEvent,
      mockDb,
    });

    const data0 = result.entities.MarketData.get("100");
    expect(data0).toBeDefined();
    expect(data0!.condition).toBe("0x0000000000000000000000000000000000000000000000000000000000003333");

    const data1 = result.entities.MarketData.get("101");
    expect(data1).toBeDefined();
    expect(data1!.condition).toBe("0x0000000000000000000000000000000000000000000000000000000000003333");
  });
});

describe("Exchange - Orderbook accumulation", () => {
  it("should accumulate volume across multiple buys on same token", async () => {
    const mockDb = MockDb.createMockDb();

    const event1 = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 0n,
      takerAssetId: 42n,
      makerAmountFilled: 1_000_000n,
      takerAmountFilled: 2_000_000n,
      fee: 0n,
    });

    const result1 = await Exchange.OrderFilled.processEvent({
      event: event1,
      mockDb,
    });

    const event2 = Exchange.OrderFilled.createMockEvent({
      orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      maker: Addresses.mockAddresses[2]!,
      taker: Addresses.mockAddresses[3]!,
      makerAssetId: 0n,
      takerAssetId: 42n,
      makerAmountFilled: 2_500_000n,
      takerAmountFilled: 3_000_000n,
      fee: 5_000n,
    });

    const result2 = await Exchange.OrderFilled.processEvent({
      event: event2,
      mockDb: result1,
    });

    const orderbook = result2.entities.Orderbook.get("42");
    expect(orderbook!.tradesQuantity).toBe(2n);
    expect(orderbook!.buysQuantity).toBe(2n);
    expect(orderbook!.collateralVolume).toBe(3_500_000n);
    expect(orderbook!.collateralBuyVolume).toBe(3_500_000n);
    expect(orderbook!.sellsQuantity).toBe(0n);
  });

  it("should accumulate mixed buys and sells on same token", async () => {
    const mockDb = MockDb.createMockDb();

    const buyEvent = Exchange.OrderFilled.createMockEvent({
      orderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 0n,
      takerAssetId: 42n,
      makerAmountFilled: 1_000_000n,
      takerAmountFilled: 2_000_000n,
      fee: 0n,
    });

    const afterBuy = await Exchange.OrderFilled.processEvent({
      event: buyEvent,
      mockDb,
    });

    const sellEvent = Exchange.OrderFilled.createMockEvent({
      orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      maker: Addresses.mockAddresses[0]!,
      taker: Addresses.mockAddresses[1]!,
      makerAssetId: 42n,
      takerAssetId: 0n,
      makerAmountFilled: 500_000n,
      takerAmountFilled: 600_000n,
      fee: 0n,
    });

    const afterSell = await Exchange.OrderFilled.processEvent({
      event: sellEvent,
      mockDb: afterBuy,
    });

    const orderbook = afterSell.entities.Orderbook.get("42");
    expect(orderbook!.tradesQuantity).toBe(2n);
    expect(orderbook!.buysQuantity).toBe(1n);
    expect(orderbook!.sellsQuantity).toBe(1n);
    expect(orderbook!.collateralBuyVolume).toBe(1_000_000n);
    expect(orderbook!.collateralSellVolume).toBe(600_000n);
    expect(orderbook!.collateralVolume).toBe(1_600_000n);
  });
});

describe("Exchange - OrdersMatched sell side", () => {
  it("should track sell-side global volume", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = Exchange.OrdersMatched.createMockEvent({
      takerOrderHash: "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      takerOrderMaker: Addresses.mockAddresses[0]!,
      makerAssetId: 42n,
      takerAssetId: 0n,
      makerAmountFilled: 500_000n,
      takerAmountFilled: 1_000_000n,
    });

    const result = await Exchange.OrdersMatched.processEvent({
      event: mockEvent,
      mockDb,
    });

    const global = result.entities.OrdersMatchedGlobal.get("");
    expect(global).toBeDefined();
    expect(global!.sellsQuantity).toBe(1n);
    expect(global!.buysQuantity).toBe(0n);
  });
});

describe("Exchange - TokenRegistered idempotency", () => {
  it("should not overwrite existing MarketData", async () => {
    const mockDb = MockDb.createMockDb();
    const conditionA = "0x0000000000000000000000000000000000000000000000000000000000003333";
    const conditionB = "0x0000000000000000000000000000000000000000000000000000000000004444";

    const seededDb = mockDb.entities.MarketData.set({
      id: "100",
      condition: conditionA,
      outcomeIndex: undefined,
    });

    const mockEvent = Exchange.TokenRegistered.createMockEvent({
      token0: 100n,
      token1: 200n,
      conditionId: conditionB,
    });

    const result = await Exchange.TokenRegistered.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    expect(result.entities.MarketData.get("100")!.condition).toBe(conditionA);
    expect(result.entities.MarketData.get("200")!.condition).toBe(conditionB);
  });
});
