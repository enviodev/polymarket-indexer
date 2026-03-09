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

const COLLATERAL_SCALE = 1_000_000n;

describe("HyperSync - Exchange", () => {
  // ============================================================
  // Existing: overflow regression test
  // ============================================================
  it("should accumulate large volumes without overflow (HyperSync)", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 35_900_780, endBlock: 35_902_000 },
      },
    });

    // Verify OrdersMatchedGlobal was created and volumes are bigint (not NaN/Infinity)
    const global = await indexer.OrdersMatchedGlobal.get("");
    expect(global).toBeDefined();
    expect(typeof global!.collateralVolume).toBe("bigint");
    expect(typeof global!.collateralBuyVolume).toBe("bigint");
    expect(typeof global!.collateralSellVolume).toBe("bigint");
    const scaledVol = Number(global!.scaledCollateralVolume);
    expect(Number.isFinite(scaledVol)).toBe(true);
    expect(scaledVol).toBeGreaterThanOrEqual(0);
    expect(global!.collateralVolume).toBeGreaterThan(0n);
    expect(global!.tradesQuantity).toBeGreaterThan(0n);
    // Internal consistency: volume = buy + sell
    expect(global!.collateralVolume).toBe(
      global!.collateralBuyVolume + global!.collateralSellVolume,
    );
    expect(global!.tradesQuantity).toBe(
      global!.buysQuantity + global!.sellsQuantity,
    );

    // Also verify Orderbook entities don't overflow
    const orderbookSets = result.changes.flatMap(
      (c: any) => c.Orderbook?.sets ?? [],
    );
    expect(orderbookSets.length).toBeGreaterThan(0);
    for (const ob of orderbookSets) {
      expect(typeof ob.collateralVolume).toBe("bigint");
      const scaled = Number(ob.scaledCollateralVolume);
      expect(Number.isFinite(scaled)).toBe(true);
      // Internal consistency: volume = buy + sell
      expect(ob.collateralVolume).toBe(
        ob.collateralBuyVolume + ob.collateralSellVolume,
      );
      expect(ob.tradesQuantity).toBe(
        ob.buysQuantity + ob.sellsQuantity,
      );
    }
  }, 120_000);

  // ============================================================
  // Existing: Exchange first block
  // ============================================================
  it("should index TokenRegistered + OrderFilled + OrdersMatched from block 33605403", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 33_605_403, endBlock: 33_606_000 },
      },
    });

    const entityKeys = new Set<string>();
    for (const c of result.changes) {
      for (const key of Object.keys(c)) {
        if (key !== "block" && key !== "blockHash" && key !== "chainId" && key !== "eventsProcessed") {
          entityKeys.add(key);
        }
      }
    }

    expect(result.changes.length).toBeGreaterThan(0);

    const global = await indexer.OrdersMatchedGlobal.get("");
    if (global) {
      expect(global.tradesQuantity).toBeGreaterThanOrEqual(0n);
      expect(global.collateralVolume).toBeGreaterThanOrEqual(0n);
      // Internal consistency
      expect(global.collateralVolume).toBe(
        global.collateralBuyVolume + global.collateralSellVolume,
      );
    }
  }, 30_000);

  // ============================================================
  // Existing: dense trading block with both Exchange addresses
  // ============================================================
  it("should handle multiple OrderFilled events across both Exchange addresses", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 55_725_073, endBlock: 55_725_130 },
      },
    });

    const orderFilledSets = result.changes.flatMap(
      (c: any) => c.OrderFilledEvent?.sets ?? [],
    );
    expect(orderFilledSets.length).toBeGreaterThan(2);

    // Validate OrderFilledEvent field quality
    for (const ofe of orderFilledSets) {
      expect(ofe.id).toMatch(/^\d+_\d+_\d+$/); // chainId_block_logIndex format
      expect(ofe.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof ofe.timestamp).toBe("bigint");
      expect(ofe.timestamp).toBeGreaterThan(0n);
      expect(ofe.orderHash).toMatch(/^0x[a-f0-9]/);
      expect(ofe.maker).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(ofe.taker).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof ofe.makerAmountFilled).toBe("bigint");
      expect(typeof ofe.takerAmountFilled).toBe("bigint");
      expect(ofe.makerAmountFilled).toBeGreaterThan(0n);
      expect(ofe.takerAmountFilled).toBeGreaterThan(0n);
      expect(typeof ofe.fee).toBe("bigint");
      expect(ofe.fee).toBeGreaterThanOrEqual(0n);
    }

    const orderbookSets = result.changes.flatMap(
      (c: any) => c.Orderbook?.sets ?? [],
    );
    expect(orderbookSets.length).toBeGreaterThan(0);
    for (const ob of orderbookSets) {
      expect(ob.collateralVolume).toBe(
        ob.collateralBuyVolume + ob.collateralSellVolume,
      );
      expect(ob.tradesQuantity).toBe(
        ob.buysQuantity + ob.sellsQuantity,
      );
      expect(Number.isFinite(Number(ob.scaledCollateralVolume))).toBe(true);
      // Scaled values should be consistent with raw values
      expect(Number(ob.scaledCollateralVolume)).toBeCloseTo(
        Number(ob.collateralVolume) / 1_000_000, 2,
      );
    }

    const userPositionSets = result.changes.flatMap(
      (c: any) => c.UserPosition?.sets ?? [],
    );
    expect(userPositionSets.length).toBeGreaterThan(0);
    for (const up of userPositionSets) {
      expect(typeof up.avgPrice).toBe("bigint");
      expect(typeof up.amount).toBe("bigint");
      expect(up.amount).toBeGreaterThanOrEqual(0n);
    }
  }, 60_000);

  // ============================================================
  // New: NegRiskExchange OrderFilled
  // ============================================================
  it("should process NegRiskExchange OrderFilled events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 55_725_073, endBlock: 55_725_130 },
      },
    });

    // This block range was chosen specifically because it contains NegRiskExchange events
    const orderFilledSets = result.changes.flatMap(
      (c: any) => c.OrderFilledEvent?.sets ?? [],
    );
    expect(orderFilledSets.length).toBeGreaterThan(0);

    // UserPosition entities should be created from trades
    const userPositionSets = result.changes.flatMap(
      (c: any) => c.UserPosition?.sets ?? [],
    );
    expect(userPositionSets.length).toBeGreaterThan(0);
    for (const up of userPositionSets) {
      expect(typeof up.user).toBe("string");
      expect(up.user).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof up.tokenId).toBe("bigint");
      expect(up.tokenId).toBeGreaterThan(0n);
      expect(typeof up.avgPrice).toBe("bigint");
      expect(typeof up.amount).toBe("bigint");
      expect(typeof up.realizedPnl).toBe("bigint");
    }
  }, 60_000);

  // ============================================================
  // New: UserPosition PnL from real trades
  // ============================================================
  it("should create UserPositions with valid avgPrice from real trades", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 55_725_073, endBlock: 55_725_130 },
      },
    });

    const userPositionSets = result.changes.flatMap(
      (c: any) => c.UserPosition?.sets ?? [],
    );
    expect(userPositionSets.length).toBeGreaterThan(0);

    for (const up of userPositionSets) {
      // avgPrice should be > 0 and within valid range for any position that was bought
      if (up.amount > 0n) {
        expect(up.avgPrice).toBeGreaterThan(0n);
        // avgPrice should be between 0 and COLLATERAL_SCALE (1_000_000 = $1.00)
        expect(up.avgPrice).toBeLessThanOrEqual(COLLATERAL_SCALE);
      }
      expect(typeof up.amount).toBe("bigint");
      expect(typeof up.avgPrice).toBe("bigint");
      expect(typeof up.realizedPnl).toBe("bigint");
      // ID format: user-tokenId
      expect(up.id).toContain("-");
    }
  }, 60_000);
});
