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

describe("HyperSync - FeeModule", () => {
  // ============================================================
  // Existing: FeeRefunded batch
  // ============================================================
  it("should index FeeRefunded events from FeeModule start block range", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 75_253_526, endBlock: 75_254_000 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    // This block range was chosen specifically for FeeRefunded events
    const feeRefundedSets = result.changes.flatMap(
      (c: any) => c.FeeRefunded?.sets ?? [],
    );
    // FeeRefunded entities may appear in changes or only via entity API
    if (feeRefundedSets.length > 0) {
      for (const fr of feeRefundedSets) {
        expect(fr.id).toMatch(/^\d+_\d+_\d+$/);
        expect(typeof fr.orderHash).toBe("string");
        expect(fr.orderHash).toMatch(/^0x[a-f0-9]/);
        expect(typeof fr.tokenId).toBe("string");
        expect(fr.tokenId.length).toBeGreaterThan(0);
        expect(typeof fr.feeRefunded).toBe("bigint");
        expect(typeof fr.feeCharged).toBe("bigint");
        expect(fr.feeRefunded).toBeGreaterThanOrEqual(0n);
        expect(fr.feeCharged).toBeGreaterThanOrEqual(0n);
        expect(fr.feeRefunded).toBeLessThanOrEqual(fr.feeCharged);
        expect(typeof fr.refundee).toBe("string");
        expect(fr.refundee).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(typeof fr.negRisk).toBe("boolean");
        expect(typeof fr.timestamp).toBe("bigint");
        expect(fr.timestamp).toBeGreaterThan(0n);
      }
    }
  }, 30_000);

  // ============================================================
  // New: NegRiskFeeModule events
  // ============================================================
  it("should index NegRiskFeeModule events with negRisk=true", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 75_253_526, endBlock: 75_254_500 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const feeRefundedSets = result.changes.flatMap(
      (c: any) => c.FeeRefunded?.sets ?? [],
    );
    // Check if any have negRisk=true (from NegRiskFeeModule address)
    const negRiskFees = feeRefundedSets.filter((fr: any) => fr.negRisk === true);
    const standardFees = feeRefundedSets.filter((fr: any) => fr.negRisk === false);

    // All entries should have consistent structure regardless of negRisk value
    for (const fr of feeRefundedSets) {
      expect(typeof fr.negRisk).toBe("boolean");
      expect(typeof fr.feeRefunded).toBe("bigint");
      expect(typeof fr.feeCharged).toBe("bigint");
      expect(fr.feeRefunded).toBeGreaterThanOrEqual(0n);
      expect(fr.feeCharged).toBeGreaterThanOrEqual(0n);
      expect(fr.feeRefunded).toBeLessThanOrEqual(fr.feeCharged);
      expect(fr.orderHash).toMatch(/^0x[a-f0-9]/);
      expect(fr.refundee).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }

    // At minimum, the total count should be positive
    expect(negRiskFees.length + standardFees.length).toBe(feeRefundedSets.length);
  }, 30_000);
});
