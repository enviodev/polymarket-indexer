import { describe, it, expect } from "vitest";
import {
  MockDb,
  UmaSportsOracle,
  Addresses,
} from "../helpers/test-utils.js";
import type { Game, Market } from "../helpers/test-utils.js";

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

describe("UmaSportsOracle - GameEmergencySettled", () => {
  it("should set game state to EmergencySettled with scores", async () => {
    const mockDb = MockDb.createMockDb();
    const gameId = "0x000000000000000000000000000000000000000000000000000000000000abcd";

    const seededDb = mockDb.entities.Game.set({
      id: gameId,
      ancillaryData: "0x1234",
      ordering: "home",
      state: "Created",
      homeScore: 0n,
      awayScore: 0n,
    });

    const mockEvent = UmaSportsOracle.GameEmergencySettled.createMockEvent({
      gameId,
      home: 2n,
      away: 2n,
    });

    const result = await UmaSportsOracle.GameEmergencySettled.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const game = result.entities.Game.get(gameId);
    expect(game).toBeDefined();
    expect(game!.state).toBe("EmergencySettled");
    expect(game!.homeScore).toBe(2n);
    expect(game!.awayScore).toBe(2n);
  });
});

describe("UmaSportsOracle - GameCanceled", () => {
  it("should set game state to Canceled", async () => {
    const mockDb = MockDb.createMockDb();
    const gameId = "0x000000000000000000000000000000000000000000000000000000000000abcd";

    const seededDb = mockDb.entities.Game.set({
      id: gameId,
      ancillaryData: "0x1234",
      ordering: "home",
      state: "Created",
      homeScore: 0n,
      awayScore: 0n,
    });

    const mockEvent = UmaSportsOracle.GameCanceled.createMockEvent({
      gameId,
    });

    const result = await UmaSportsOracle.GameCanceled.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const game = result.entities.Game.get(gameId);
    expect(game!.state).toBe("Canceled");
    expect(game!.homeScore).toBe(0n);
    expect(game!.awayScore).toBe(0n);
  });
});

describe("UmaSportsOracle - GamePaused/Unpaused", () => {
  it("should pause and unpause a game", async () => {
    const mockDb = MockDb.createMockDb();
    const gameId = "0x000000000000000000000000000000000000000000000000000000000000abcd";

    const seededDb = mockDb.entities.Game.set({
      id: gameId,
      ancillaryData: "0x1234",
      ordering: "home",
      state: "Created",
      homeScore: 0n,
      awayScore: 0n,
    });

    const pauseEvent = UmaSportsOracle.GamePaused.createMockEvent({ gameId });
    const pausedResult = await UmaSportsOracle.GamePaused.processEvent({
      event: pauseEvent,
      mockDb: seededDb,
    });
    expect(pausedResult.entities.Game.get(gameId)!.state).toBe("Paused");

    const unpauseEvent = UmaSportsOracle.GameUnpaused.createMockEvent({ gameId });
    const unpausedResult = await UmaSportsOracle.GameUnpaused.processEvent({
      event: unpauseEvent,
      mockDb: pausedResult,
    });
    expect(unpausedResult.entities.Game.get(gameId)!.state).toBe("Created");
  });
});

describe("UmaSportsOracle - Market types and ordering", () => {
  it("should handle spreads market type", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId = "0x0000000000000000000000000000000000000000000000000000000000001112";

    const mockEvent = UmaSportsOracle.MarketCreated.createMockEvent({
      marketId,
      gameId: "0x000000000000000000000000000000000000000000000000000000000000abcd",
      conditionId: "0x0000000000000000000000000000000000000000000000000000000000002222",
      marketType: 1n,
      underdog: 0n,
      line: 350n,
    });

    const result = await UmaSportsOracle.MarketCreated.processEvent({
      event: mockEvent,
      mockDb,
    });

    const market = result.entities.Market.get(marketId);
    expect(market!.marketType).toBe("spreads");
    expect(market!.underdog).toBe("home");
    expect(market!.line).toBe(350n);
  });

  it("should handle totals market type", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId = "0x0000000000000000000000000000000000000000000000000000000000001113";

    const mockEvent = UmaSportsOracle.MarketCreated.createMockEvent({
      marketId,
      gameId: "0x000000000000000000000000000000000000000000000000000000000000abcd",
      conditionId: "0x0000000000000000000000000000000000000000000000000000000000002222",
      marketType: 2n,
      underdog: 0n,
      line: 2105n,
    });

    const result = await UmaSportsOracle.MarketCreated.processEvent({
      event: mockEvent,
      mockDb,
    });

    expect(result.entities.Market.get(marketId)!.marketType).toBe("totals");
  });

  it("should handle away ordering in GameCreated", async () => {
    const mockDb = MockDb.createMockDb();
    const gameId = "0x0000000000000000000000000000000000000000000000000000000000009999";

    const mockEvent = UmaSportsOracle.GameCreated.createMockEvent({
      gameId,
      ordering: 1n,
      ancillaryData: "0xbeef",
      timestamp: 1700000000n,
    });

    const result = await UmaSportsOracle.GameCreated.processEvent({
      event: mockEvent,
      mockDb,
    });

    expect(result.entities.Game.get(gameId)!.ordering).toBe("away");
  });
});

describe("UmaSportsOracle - MarketPaused/Unpaused", () => {
  it("should pause and unpause a market", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId = "0x0000000000000000000000000000000000000000000000000000000000001111";

    const seededDb = mockDb.entities.Market.set({
      id: marketId,
      gameId: "0x000000000000000000000000000000000000000000000000000000000000abcd",
      state: "Created",
      marketType: "moneyline",
      underdog: "away",
      line: 0n,
      payouts: [] as bigint[],
    });

    const pauseEvent = UmaSportsOracle.MarketPaused.createMockEvent({ marketId });
    const pausedResult = await UmaSportsOracle.MarketPaused.processEvent({
      event: pauseEvent,
      mockDb: seededDb,
    });
    expect(pausedResult.entities.Market.get(marketId)!.state).toBe("Paused");

    const unpauseEvent = UmaSportsOracle.MarketUnpaused.createMockEvent({ marketId });
    const unpausedResult = await UmaSportsOracle.MarketUnpaused.processEvent({
      event: unpauseEvent,
      mockDb: pausedResult,
    });
    expect(unpausedResult.entities.Market.get(marketId)!.state).toBe("Created");
  });
});

describe("UmaSportsOracle - MarketEmergencyResolved", () => {
  it("should resolve market with emergency payouts", async () => {
    const mockDb = MockDb.createMockDb();
    const marketId = "0x0000000000000000000000000000000000000000000000000000000000001111";

    const seededDb = mockDb.entities.Market.set({
      id: marketId,
      gameId: "0x000000000000000000000000000000000000000000000000000000000000abcd",
      state: "Created",
      marketType: "moneyline",
      underdog: "away",
      line: 0n,
      payouts: [] as bigint[],
    });

    const mockEvent = UmaSportsOracle.MarketEmergencyResolved.createMockEvent({
      marketId,
      payouts: [1n, 1n],
    });

    const result = await UmaSportsOracle.MarketEmergencyResolved.processEvent({
      event: mockEvent,
      mockDb: seededDb,
    });

    const market = result.entities.Market.get(marketId);
    expect(market!.state).toBe("EmergencyResolved");
    expect(market!.payouts).toEqual([1n, 1n]);
  });
});
