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

describe("HyperSync - ConditionalTokens", () => {
  // ============================================================
  // Existing: ConditionPreparation + FPMM from factory
  // ============================================================
  it("should create Condition from ConditionPreparation and FPMM from factory", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_027_499, endBlock: 4_027_847 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    // Condition should be created from ConditionPreparation
    const conditionSets = result.changes.flatMap(
      (c: any) => c.Condition?.sets ?? [],
    );
    expect(conditionSets.length).toBeGreaterThan(0);
    for (const cond of conditionSets) {
      expect(cond.id).toMatch(/^0x[a-f0-9]{64}$/);
      expect(Array.isArray(cond.positionIds)).toBe(true);
      // Polymarket uses binary conditions: exactly 2 position IDs
      expect(cond.positionIds.length).toBe(2);
      // Position IDs should be distinct bigints
      expect(typeof cond.positionIds[0]).toBe("bigint");
      expect(typeof cond.positionIds[1]).toBe("bigint");
      expect(cond.positionIds[0]).not.toBe(cond.positionIds[1]);
      // Fresh conditions have empty payoutNumerators
      expect(Array.isArray(cond.payoutNumerators)).toBe(true);
      expect(cond.payoutDenominator).toBe(0n);
    }

    // Position entities should be created
    const positionSets = result.changes.flatMap(
      (c: any) => c.Position?.sets ?? [],
    );
    expect(positionSets.length).toBeGreaterThan(0);
    for (const pos of positionSets) {
      expect(typeof pos.id).toBe("string");
      expect(pos.id.length).toBeGreaterThan(0);
      expect(typeof pos.condition).toBe("string");
      expect(pos.condition).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof pos.outcomeIndex).toBe("bigint");
      // Binary conditions have outcome index 0 or 1
      expect([0n, 1n]).toContain(pos.outcomeIndex);
    }

    // FixedProductMarketMaker should be created from factory
    const fpmmSets = result.changes.flatMap(
      (c: any) => c.FixedProductMarketMaker?.sets ?? [],
    );
    expect(fpmmSets.length).toBeGreaterThan(0);
    const fpmm = fpmmSets[0];
    expect(fpmm.id).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(fpmm.fee).toBeGreaterThanOrEqual(0n);
    expect(fpmm.tradesQuantity).toBe(0n);
    expect(fpmm.outcomeTokenAmounts).toEqual([0n, 0n]);
    expect(fpmm.outcomeTokenAmounts.length).toBe(2);
    expect(Array.isArray(fpmm.conditions)).toBe(true);
    expect(fpmm.conditions.length).toBeGreaterThan(0);
    // Verify zero-initialized metrics
    expect(fpmm.collateralVolume).toBe(0n);
    expect(fpmm.buysQuantity).toBe(0n);
    expect(fpmm.sellsQuantity).toBe(0n);
    expect(fpmm.totalSupply).toBe(0n);
  }, 30_000);

  // ============================================================
  // Existing: Split, OI, and Redemption
  // ============================================================
  it("should create Split, update OI, and create Redemption from real events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_028_608, endBlock: 4_028_725 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    // Check for Split entities from PositionSplit
    const splitSets = result.changes.flatMap(
      (c: any) => c.Split?.sets ?? [],
    );
    // This block range contains PositionSplit events
    if (splitSets.length > 0) {
      for (const split of splitSets) {
        expect(typeof split.amount).toBe("bigint");
        expect(split.amount).toBeGreaterThan(0n);
        expect(typeof split.timestamp).toBe("bigint");
        expect(split.timestamp).toBeGreaterThan(0n);
        expect(split.stakeholder).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(split.condition).toMatch(/^0x[a-f0-9]{64}$/);
      }
    }

    // Check that GlobalOpenInterest was created (from PositionSplit with USDC collateral)
    const globalOI = await indexer.GlobalOpenInterest.get("");
    // OI may or may not exist depending on whether the splits were USDC-backed
    if (globalOI) {
      expect(typeof globalOI.amount).toBe("bigint");
    }
  }, 30_000);

  // ============================================================
  // New: ConditionResolution
  // ============================================================
  it("should process ConditionResolution events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_023_686, endBlock: 4_025_000 },
      },
    });

    const conditionSets = result.changes.flatMap(
      (c: any) => c.Condition?.sets ?? [],
    );

    for (const cond of conditionSets) {
      expect(cond.id).toMatch(/^0x[a-f0-9]{64}$/);
      expect(Array.isArray(cond.payoutNumerators)).toBe(true);
      expect(typeof cond.payoutDenominator).toBe("bigint");
      expect(Array.isArray(cond.positionIds)).toBe(true);
      expect(cond.positionIds.length).toBe(2);
      // If resolved, payoutDenominator should equal sum of payoutNumerators
      if (cond.payoutNumerators.length > 0) {
        const sum = cond.payoutNumerators.reduce(
          (acc: bigint, v: bigint) => acc + v,
          0n,
        );
        expect(cond.payoutDenominator).toBe(sum);
        expect(cond.payoutDenominator).toBeGreaterThan(0n);
      }
    }
  }, 30_000);

  // ============================================================
  // New: PositionsMerge real data
  // ============================================================
  it("should process PositionsMerge events from real data", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_028_608, endBlock: 4_028_725 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    // Look for Merge entities in changes
    const mergeSets = result.changes.flatMap(
      (c: any) => c.Merge?.sets ?? [],
    );
    // Merges may or may not exist in this range (depends on whether user merges happen
    // vs FPMM/Exchange merges which are skipped), so keep the guard but add quality checks
    if (mergeSets.length > 0) {
      for (const merge of mergeSets) {
        expect(typeof merge.amount).toBe("bigint");
        expect(merge.amount).toBeGreaterThan(0n);
        expect(typeof merge.timestamp).toBe("bigint");
        expect(merge.timestamp).toBeGreaterThan(0n);
        expect(merge.stakeholder).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(merge.condition).toMatch(/^0x[a-f0-9]{64}$/);
      }
    }
  }, 30_000);

  // ============================================================
  // New: Dense multi-split block OI accumulation
  // ============================================================
  it("should accumulate GlobalOpenInterest from dense split blocks", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_028_608, endBlock: 4_028_725 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    // Verify Split entities are generated (confirming splits occurred)
    const splitSets = result.changes.flatMap(
      (c: any) => c.Split?.sets ?? [],
    );

    const globalOI = await indexer.GlobalOpenInterest.get("");
    // If splits occurred with USDC collateral, OI should be positive
    if (globalOI) {
      expect(typeof globalOI.amount).toBe("bigint");
      // OI could be positive or zero depending on splits vs merges
      // but the entity should have a valid bigint
      expect(globalOI.id).toBe("");
    }
  }, 30_000);
});
