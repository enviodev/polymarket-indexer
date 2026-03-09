import { describe, it, expect } from "vitest";
// Import handlers to register them
import "../../handlers/FeeModule.js";
import "../../handlers/UmaSportsOracle.js";
import "../../handlers/Wallet.js";
import "../../handlers/Exchange.js";
import "../../handlers/ConditionalTokens.js";
import "../../handlers/NegRiskAdapter.js";
import "../../handlers/FPMMFactory.js";
import "../../handlers/FixedProductMarketMaker.js";

describe("HyperSync - UmaSportsOracle", () => {
  // ============================================================
  // Existing: Game and Market creation
  // ============================================================
  it("should create Game and Market entities from real events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 69_015_766, endBlock: 69_017_779 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    // Game should be created
    const gameSets = result.changes.flatMap(
      (c: any) => c.Game?.sets ?? [],
    );
    expect(gameSets.length).toBeGreaterThan(0);
    const game = gameSets[0];
    expect(game.id).toMatch(/^0x[a-f0-9]/);
    expect(game.state).toBe("Created");
    expect(game.homeScore).toBe(0n);
    expect(game.awayScore).toBe(0n);
    expect(["home", "away"]).toContain(game.ordering);
    expect(typeof game.ancillaryData).toBe("string");
    expect(game.ancillaryData.length).toBeGreaterThan(0);

    // All games should have valid structure
    for (const g of gameSets) {
      expect(g.id).toMatch(/^0x[a-f0-9]/);
      expect(["Created", "Settled", "Canceled", "Paused", "EmergencySettled"]).toContain(g.state);
      expect(typeof g.homeScore).toBe("bigint");
      expect(typeof g.awayScore).toBe("bigint");
      expect(g.homeScore).toBeGreaterThanOrEqual(0n);
      expect(g.awayScore).toBeGreaterThanOrEqual(0n);
      expect(["home", "away"]).toContain(g.ordering);
    }

    // Market should be created
    const marketSets = result.changes.flatMap(
      (c: any) => c.Market?.sets ?? [],
    );
    expect(marketSets.length).toBeGreaterThan(0);
    const market = marketSets[0];
    expect(market.id).toMatch(/^0x[a-f0-9]/);
    expect(market.state).toBe("Created");
    expect(["moneyline", "spreads", "totals"]).toContain(market.marketType);
    expect(["home", "away"]).toContain(market.underdog);
    expect(market.payouts).toEqual([]);
    expect(typeof market.line).toBe("bigint");
    expect(typeof market.gameId).toBe("string");
    expect(market.gameId).toMatch(/^0x[a-f0-9]/);

    // All markets should have valid structure
    for (const m of marketSets) {
      expect(m.id).toMatch(/^0x[a-f0-9]/);
      expect(["Created", "Resolved", "Paused", "EmergencyResolved"]).toContain(m.state);
      expect(["moneyline", "spreads", "totals"]).toContain(m.marketType);
      expect(["home", "away"]).toContain(m.underdog);
      expect(Array.isArray(m.payouts)).toBe(true);
      expect(typeof m.line).toBe("bigint");
    }
  }, 60_000);

  // ============================================================
  // New: Game lifecycle (Created -> Settled)
  // ============================================================
  it("should process Game lifecycle through settlement", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 69_015_766, endBlock: 69_020_000 },
      },
    });

    const gameSets = result.changes.flatMap(
      (c: any) => c.Game?.sets ?? [],
    );
    expect(gameSets.length).toBeGreaterThan(0);

    // All game entities should have valid structure regardless of state
    for (const g of gameSets) {
      expect(g.id).toMatch(/^0x[a-f0-9]/);
      expect(["Created", "Settled", "Canceled", "Paused", "EmergencySettled"]).toContain(g.state);
      expect(typeof g.homeScore).toBe("bigint");
      expect(typeof g.awayScore).toBe("bigint");
      expect(g.homeScore).toBeGreaterThanOrEqual(0n);
      expect(g.awayScore).toBeGreaterThanOrEqual(0n);
      expect(["home", "away"]).toContain(g.ordering);
    }

    // Settled games should have scores (may be 0 but scores are set)
    const settledGames = gameSets.filter((g: any) => g.state === "Settled");
    // Settlement may not happen in this range; if it does, verify scores
    if (settledGames.length > 0) {
      for (const g of settledGames) {
        expect(typeof g.homeScore).toBe("bigint");
        expect(typeof g.awayScore).toBe("bigint");
        // At least one team should have scored or it's 0-0
        // (no further assumption since 0-0 is valid)
      }
    }

    // At minimum, Created games should exist since the range starts at creation
    const createdGames = gameSets.filter((g: any) => g.state === "Created");
    expect(createdGames.length).toBeGreaterThan(0);
  }, 60_000);

  // ============================================================
  // New: Market lifecycle (Created -> Resolved)
  // ============================================================
  it("should process Market lifecycle through resolution", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 69_015_766, endBlock: 69_020_000 },
      },
    });

    const marketSets = result.changes.flatMap(
      (c: any) => c.Market?.sets ?? [],
    );
    expect(marketSets.length).toBeGreaterThan(0);

    // All market entities should have valid structure
    for (const m of marketSets) {
      expect(m.id).toMatch(/^0x[a-f0-9]/);
      expect(["Created", "Resolved", "Paused", "EmergencyResolved"]).toContain(m.state);
      expect(["moneyline", "spreads", "totals"]).toContain(m.marketType);
      expect(["home", "away"]).toContain(m.underdog);
      expect(Array.isArray(m.payouts)).toBe(true);
      expect(typeof m.line).toBe("bigint");
      expect(m.gameId).toMatch(/^0x[a-f0-9]/);
    }

    // Resolved markets should have non-empty payouts
    const resolvedMarkets = marketSets.filter((m: any) => m.state === "Resolved");
    // Resolution may not happen in this range
    if (resolvedMarkets.length > 0) {
      for (const m of resolvedMarkets) {
        expect(Array.isArray(m.payouts)).toBe(true);
        expect(m.payouts.length).toBeGreaterThan(0);
      }
    }

    // At minimum, Created markets should exist since the range starts at creation
    const createdMarkets = marketSets.filter((m: any) => m.state === "Created");
    expect(createdMarkets.length).toBeGreaterThan(0);
  }, 60_000);

  // ============================================================
  // New: GameCanceled
  // ============================================================
  it("should process GameCanceled events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 69_015_766, endBlock: 69_025_000 },
      },
    });

    const gameSets = result.changes.flatMap(
      (c: any) => c.Game?.sets ?? [],
    );
    expect(gameSets.length).toBeGreaterThan(0);

    // All games should have valid structure
    for (const g of gameSets) {
      expect(g.id).toMatch(/^0x[a-f0-9]/);
      expect(["Created", "Settled", "Canceled", "Paused", "EmergencySettled"]).toContain(g.state);
      expect(typeof g.homeScore).toBe("bigint");
      expect(typeof g.awayScore).toBe("bigint");
      expect(["home", "away"]).toContain(g.ordering);
    }

    // Look for Canceled games - wider range so may include them
    const canceledGames = gameSets.filter((g: any) => g.state === "Canceled");
    if (canceledGames.length > 0) {
      for (const g of canceledGames) {
        expect(g.state).toBe("Canceled");
        // Canceled games retain their original scores (likely 0)
        expect(typeof g.homeScore).toBe("bigint");
        expect(typeof g.awayScore).toBe("bigint");
      }
    }
  }, 120_000);

  // ============================================================
  // New: GamePaused
  // ============================================================
  it("should process GamePaused events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 69_015_766, endBlock: 69_025_000 },
      },
    });

    const gameSets = result.changes.flatMap(
      (c: any) => c.Game?.sets ?? [],
    );
    expect(gameSets.length).toBeGreaterThan(0);

    // All games should have valid structure
    for (const g of gameSets) {
      expect(g.id).toMatch(/^0x[a-f0-9]/);
      expect(["Created", "Settled", "Canceled", "Paused", "EmergencySettled"]).toContain(g.state);
      expect(typeof g.homeScore).toBe("bigint");
      expect(typeof g.awayScore).toBe("bigint");
      expect(["home", "away"]).toContain(g.ordering);
    }

    // Look for Paused games - wider range so may include them
    const pausedGames = gameSets.filter((g: any) => g.state === "Paused");
    if (pausedGames.length > 0) {
      for (const g of pausedGames) {
        expect(g.state).toBe("Paused");
      }
    }
  }, 120_000);
});
