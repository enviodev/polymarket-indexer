import { describe, it, expect } from "vitest";
import { TestHelpers, type FeeRefunded, type Game, type Market } from "generated";

// Import handlers to register them before tests run
import "./handlers/FeeModule.js";
import "./handlers/UmaSportsOracle.js";

const { MockDb, FeeModule, UmaSportsOracle, Addresses } = TestHelpers;

// ============================================================
// Fee Module Tests
// ============================================================

describe("FeeModule", () => {
  it("should create a FeeRefunded entity from FeeRefunded event", async () => {
    const mockDb = MockDb.createMockDb();

    const mockEvent = FeeModule.FeeRefunded.createMockEvent({
      orderHash: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      to: Addresses.mockAddresses[0]!,
      id: 12345n,
      refund: 1000n,
      feeCharged: 500n,
    });

    const result = await FeeModule.FeeRefunded.processEvent({
      event: mockEvent,
      mockDb,
    });

    const entities = result.entities.FeeRefunded.getAll();
    expect(entities.length).toBe(1);
    const entity = entities[0]!;
    expect(entity.tokenId).toBe("12345");
    expect(entity.feeRefunded).toBe(1000n);
    expect(entity.feeCharged).toBe(500n);
    expect(entity.refundee).toBe(Addresses.mockAddresses[0]!);
  });
});

// ============================================================
// Sports Oracle Tests
// ============================================================

describe("UmaSportsOracle", () => {
  it("should create a Game entity from GameCreated event", async () => {
    const mockDb = MockDb.createMockDb();

    const gameId = "0x000000000000000000000000000000000000000000000000000000000000abcd";
    const mockEvent = UmaSportsOracle.GameCreated.createMockEvent({
      gameId,
      ordering: 0n,
      ancillaryData: "0x1234",
      timestamp: 1700000000n,
    });

    const result = await UmaSportsOracle.GameCreated.processEvent({
      event: mockEvent,
      mockDb,
    });

    const entities = result.entities.Game.getAll();
    expect(entities.length).toBe(1);
    const game = entities[0]!;
    expect(game.state).toBe("Created");
    expect(game.ordering).toBe("home");
    expect(game.homeScore).toBe(0n);
    expect(game.awayScore).toBe(0n);
  });

  it("should update Game state on GameSettled", async () => {
    const mockDb = MockDb.createMockDb();
    const gameId = "0x000000000000000000000000000000000000000000000000000000000000abcd";

    const initialGame: Game = {
      id: gameId,
      ancillaryData: "0x1234",
      ordering: "home",
      state: "Created",
      homeScore: 0n,
      awayScore: 0n,
    };
    const seededDb = mockDb.entities.Game.set(initialGame);

    const mockEvent = UmaSportsOracle.GameSettled.createMockEvent({
      gameId,
      home: 3n,
      away: 1n,
    });

    const result = await UmaSportsOracle.GameSettled.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const game = result.entities.Game.get(gameId);
    expect(game).toBeDefined();
    expect(game!.state).toBe("Settled");
    expect(game!.homeScore).toBe(3n);
    expect(game!.awayScore).toBe(1n);
  });

  it("should create a Market entity from MarketCreated event", async () => {
    const mockDb = MockDb.createMockDb();

    const marketId = "0x0000000000000000000000000000000000000000000000000000000000001111";
    const gameId = "0x000000000000000000000000000000000000000000000000000000000000abcd";
    const conditionId = "0x0000000000000000000000000000000000000000000000000000000000002222";

    const mockEvent = UmaSportsOracle.MarketCreated.createMockEvent({
      marketId,
      gameId,
      conditionId,
      marketType: 0n,
      underdog: 1n,
      line: 150n,
    });

    const result = await UmaSportsOracle.MarketCreated.processEvent({
      event: mockEvent,
      mockDb,
    });

    const entities = result.entities.Market.getAll();
    expect(entities.length).toBe(1);
    const market = entities[0]!;
    expect(market.state).toBe("Created");
    expect(market.marketType).toBe("moneyline");
    expect(market.underdog).toBe("away");
    expect(market.line).toBe(150n);
    expect(market.payouts).toEqual([]);
  });

  it("should update Market state on MarketResolved with payouts", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId = "0x0000000000000000000000000000000000000000000000000000000000001111";

    const seededDb = mockDb.entities.Market.set({
      id: marketId,
      gameId: "0x000000000000000000000000000000000000000000000000000000000000abcd",
      state: "Created",
      marketType: "moneyline",
      underdog: "away",
      line: 150n,
      payouts: [] as bigint[],
    });

    const mockEvent = UmaSportsOracle.MarketResolved.createMockEvent({
      marketId,
      payouts: [1n, 0n],
    });

    const result = await UmaSportsOracle.MarketResolved.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const market = result.entities.Market.get(marketId);
    expect(market).toBeDefined();
    expect(market!.state).toBe("Resolved");
    expect(market!.payouts).toEqual([1n, 0n]);
  });
});
