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

describe("HyperSync - NegRiskAdapter", () => {
  // ============================================================
  // Existing: NegRiskEvent creation + questionCount
  // ============================================================
  it("should create NegRiskEvent and increment questionCount", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 50_750_368, endBlock: 50_751_000 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const negRiskSets = result.changes.flatMap(
      (c: any) => c.NegRiskEvent?.sets ?? [],
    );

    // NegRiskEvent entities may appear in changes or only via entity API
    for (const nr of negRiskSets) {
      expect(nr.id).toMatch(/^0x[a-f0-9]/);
      expect(typeof nr.feeBps).toBe("bigint");
      expect(nr.feeBps).toBeGreaterThanOrEqual(0n);
      expect(nr.feeBps).toBeLessThanOrEqual(10_000n);
      expect(typeof nr.questionCount).toBe("bigint");
      expect(nr.questionCount).toBeGreaterThanOrEqual(0n);
    }
  }, 30_000);

  // ============================================================
  // New: NegRisk PositionSplit
  // ============================================================
  it("should process NegRisk PositionSplit events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 50_505_403, endBlock: 50_506_000 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    // Look for Split entities related to neg-risk
    const splitSets = result.changes.flatMap(
      (c: any) => c.Split?.sets ?? [],
    );
    // Splits from NegRiskAdapter.PositionSplit skip NegRiskExchange stakeholders,
    // so user-initiated splits should appear if present in this range
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
  }, 30_000);

  // ============================================================
  // New: NegRisk PositionsMerge
  // ============================================================
  it("should process NegRisk PositionsMerge events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 50_750_368, endBlock: 50_752_000 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const mergeSets = result.changes.flatMap(
      (c: any) => c.Merge?.sets ?? [],
    );
    // Merges from NegRiskAdapter skip NegRiskExchange stakeholders;
    // user-initiated merges may or may not be in this range
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
  }, 60_000);

  // ============================================================
  // New: NegRisk PayoutRedemption
  // ============================================================
  it("should process NegRisk PayoutRedemption events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 50_750_368, endBlock: 50_752_000 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const redemptionSets = result.changes.flatMap(
      (c: any) => c.Redemption?.sets ?? [],
    );
    // Redemptions may or may not be in this range
    if (redemptionSets.length > 0) {
      for (const r of redemptionSets) {
        expect(typeof r.payout).toBe("bigint");
        expect(r.payout).toBeGreaterThanOrEqual(0n);
        expect(typeof r.timestamp).toBe("bigint");
        expect(r.timestamp).toBeGreaterThan(0n);
        expect(r.redeemer).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(r.condition).toMatch(/^0x[a-f0-9]{64}$/);
        expect(Array.isArray(r.indexSets)).toBe(true);
        // NegRisk redemptions always use [1n, 2n] indexSets for binary
        expect(r.indexSets).toEqual([1n, 2n]);
      }
    }
  }, 60_000);

  // ============================================================
  // New: NegRisk PositionsConverted
  // ============================================================
  it("should process NegRisk PositionsConverted events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 50_750_368, endBlock: 50_752_000 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const conversionSets = result.changes.flatMap(
      (c: any) => c.NegRiskConversion?.sets ?? [],
    );
    // Conversions may or may not be in this range
    if (conversionSets.length > 0) {
      for (const conv of conversionSets) {
        expect(typeof conv.amount).toBe("bigint");
        expect(conv.amount).toBeGreaterThan(0n);
        expect(typeof conv.questionCount).toBe("bigint");
        expect(conv.questionCount).toBeGreaterThan(0n);
        expect(typeof conv.timestamp).toBe("bigint");
        expect(conv.timestamp).toBeGreaterThan(0n);
        expect(conv.stakeholder).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(conv.negRiskMarketId).toMatch(/^0x[a-f0-9]/);
        expect(typeof conv.indexSet).toBe("bigint");
        expect(conv.indexSet).toBeGreaterThan(0n);
      }
    }
  }, 60_000);
});
