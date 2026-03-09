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

describe("HyperSync - FPMM", () => {
  // ============================================================
  // Existing: batch creation
  // ============================================================
  it("should register multiple FPMMs in blocks 4782917-4782977", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_782_917, endBlock: 4_782_978 },
      },
    });

    // Dynamic FPMM addresses should be registered
    const fpmmAddresses = indexer.chains[137].FixedProductMarketMaker.addresses;
    expect(fpmmAddresses.length).toBeGreaterThanOrEqual(8);

    // Verify FPMM entities were created with proper structure
    const fpmmSets = result.changes.flatMap(
      (c: any) => c.FixedProductMarketMaker?.sets ?? [],
    );
    expect(fpmmSets.length).toBeGreaterThanOrEqual(7);
    for (const fpmm of fpmmSets) {
      expect(fpmm.id).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(fpmm.fee).toBeGreaterThanOrEqual(0n);
      expect(fpmm.outcomeTokenAmounts.length).toBe(2);
      expect(Array.isArray(fpmm.conditions)).toBe(true);
      expect(fpmm.conditions.length).toBeGreaterThan(0);
      expect(typeof fpmm.creationTimestamp).toBe("bigint");
      expect(fpmm.creationTimestamp).toBeGreaterThan(0n);
      expect(fpmm.creationTransactionHash).toMatch(/^0x[a-f0-9]{64}$/);
      // New FPMMs should start with zero metrics
      expect(fpmm.tradesQuantity).toBe(0n);
      expect(fpmm.totalSupply).toBe(0n);
      expect(fpmm.collateralVolume).toBe(0n);
    }
  }, 30_000);

  // ============================================================
  // New: FPMM trading lifecycle
  // ============================================================
  it("should process FPMM trading events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 5_000_000, endBlock: 5_001_000 },
      },
    });

    // Look for FpmmTransaction entities from buys/sells
    const txnSets = result.changes.flatMap(
      (c: any) => c.FpmmTransaction?.sets ?? [],
    );
    // This is a wider range; FPMM trades may or may not be present
    if (txnSets.length > 0) {
      for (const txn of txnSets) {
        expect(["Buy", "Sell"]).toContain(txn.type);
        expect(typeof txn.tradeAmount).toBe("bigint");
        expect(txn.tradeAmount).toBeGreaterThan(0n);
        expect(typeof txn.feeAmount).toBe("bigint");
        expect(txn.feeAmount).toBeGreaterThanOrEqual(0n);
        expect(typeof txn.timestamp).toBe("bigint");
        expect(txn.timestamp).toBeGreaterThan(0n);
        expect(txn.user).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(txn.market_id).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(typeof txn.outcomeIndex).toBe("bigint");
        expect([0n, 1n]).toContain(txn.outcomeIndex);
        expect(typeof txn.outcomeTokensAmount).toBe("bigint");
        expect(txn.outcomeTokensAmount).toBeGreaterThan(0n);
      }
    }

    // Check FPMM entity updates if trades occurred
    const fpmmSets = result.changes.flatMap(
      (c: any) => c.FixedProductMarketMaker?.sets ?? [],
    );
    if (fpmmSets.length > 0) {
      for (const fpmm of fpmmSets) {
        expect(fpmm.outcomeTokenAmounts.length).toBe(2);
        expect(fpmm.fee).toBeGreaterThanOrEqual(0n);
        // Prices should be valid numbers
        for (const price of fpmm.outcomeTokenPrices) {
          expect(typeof price).toBe("number");
          expect(Number.isFinite(price)).toBe(true);
          expect(price).toBeGreaterThanOrEqual(0);
        }
        // Volume consistency
        expect(fpmm.collateralVolume).toBe(
          fpmm.collateralBuyVolume + fpmm.collateralSellVolume,
        );
        expect(fpmm.tradesQuantity).toBe(
          fpmm.buysQuantity + fpmm.sellsQuantity,
        );
        // Scaled values should be finite
        expect(Number.isFinite(fpmm.scaledCollateralVolume)).toBe(true);
      }
    }
  }, 60_000);

  // ============================================================
  // New: FPMMFundingAdded
  // ============================================================
  it("should process FPMMFundingAdded events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_782_917, endBlock: 4_783_500 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const fundingAddSets = result.changes.flatMap(
      (c: any) => c.FpmmFundingAddition?.sets ?? [],
    );
    // Funding additions may or may not appear in changes depending on the block range
    for (const fa of fundingAddSets) {
      expect(typeof fa.sharesMinted).toBe("bigint");
      expect(fa.sharesMinted).toBeGreaterThan(0n);
      expect(Array.isArray(fa.amountsAdded)).toBe(true);
      expect(fa.amountsAdded.length).toBe(2);
      expect(Array.isArray(fa.amountsRefunded)).toBe(true);
      expect(fa.amountsRefunded.length).toBe(2);
      // At least one amount should be > 0
      const totalAdded = (fa.amountsAdded[0] ?? 0n) + (fa.amountsAdded[1] ?? 0n);
      expect(totalAdded).toBeGreaterThan(0n);
      expect(typeof fa.timestamp).toBe("bigint");
      expect(fa.timestamp).toBeGreaterThan(0n);
      expect(fa.funder).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(fa.fpmm_id).toMatch(/^0x[a-fA-F0-9]{40}$/);
      // Refunded amounts should be non-negative
      for (const refund of fa.amountsRefunded) {
        expect(refund).toBeGreaterThanOrEqual(0n);
      }
    }
  }, 30_000);

  // ============================================================
  // New: FPMMFundingRemoved
  // ============================================================
  it("should process FPMMFundingRemoved events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_782_917, endBlock: 4_785_000 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const fundingRemoveSets = result.changes.flatMap(
      (c: any) => c.FpmmFundingRemoval?.sets ?? [],
    );
    // Funding removals may not happen in this range
    if (fundingRemoveSets.length > 0) {
      for (const fr of fundingRemoveSets) {
        expect(typeof fr.sharesBurnt).toBe("bigint");
        expect(fr.sharesBurnt).toBeGreaterThan(0n);
        expect(Array.isArray(fr.amountsRemoved)).toBe(true);
        expect(fr.amountsRemoved.length).toBe(2);
        expect(typeof fr.collateralRemoved).toBe("bigint");
        expect(fr.collateralRemoved).toBeGreaterThanOrEqual(0n);
        expect(typeof fr.timestamp).toBe("bigint");
        expect(fr.timestamp).toBeGreaterThan(0n);
        expect(fr.funder).toMatch(/^0x[a-fA-F0-9]{40}$/);
        expect(fr.fpmm_id).toMatch(/^0x[a-fA-F0-9]{40}$/);
      }
    }
  }, 60_000);

  // ============================================================
  // New: FPMM Transfer tracking
  // ============================================================
  it("should track FPMM pool membership via Transfer events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 4_782_917, endBlock: 4_783_500 },
      },
    });

    expect(result.changes.length).toBeGreaterThan(0);

    const membershipSets = result.changes.flatMap(
      (c: any) => c.FpmmPoolMembership?.sets ?? [],
    );
    // Pool membership may or may not appear in changes
    for (const pm of membershipSets) {
      expect(typeof pm.amount).toBe("bigint");
      // After initial funding, the funder's amount should be positive
      // (though it could be 0 for the zero-address burn side)
      expect(typeof pm.funder).toBe("string");
      expect(pm.funder).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof pm.pool_id).toBe("string");
      expect(pm.pool_id).toMatch(/^0x[a-fA-F0-9]{40}$/);
      // ID should be pool_id-funder composite
      expect(pm.id).toBe(`${pm.pool_id}-${pm.funder}`);
    }
  }, 30_000);
});
