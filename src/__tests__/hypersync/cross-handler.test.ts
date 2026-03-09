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

describe("HyperSync - Cross-handler integration", () => {
  // ============================================================
  // Dense multi-event block
  // ============================================================
  it("should process dense multi-event block with Exchange + ConditionalTokens", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 55_725_073, endBlock: 55_725_130 },
      },
    });

    // Collect all entity types that appear in changes
    const entityTypes = new Set<string>();
    for (const c of result.changes) {
      for (const key of Object.keys(c)) {
        if (key !== "block" && key !== "blockHash" && key !== "chainId" && key !== "eventsProcessed") {
          const change = (c as any)[key];
          if (change?.sets?.length > 0) {
            entityTypes.add(key);
          }
        }
      }
    }

    // Should have multiple entity types from different handlers
    expect(entityTypes.size).toBeGreaterThan(1);
    // OrderFilledEvent should be present from Exchange handler
    expect(entityTypes.has("OrderFilledEvent")).toBe(true);
    // Orderbook should be updated from Exchange handler
    expect(entityTypes.has("Orderbook")).toBe(true);
    // UserPosition should be created from PnL tracking
    expect(entityTypes.has("UserPosition")).toBe(true);

    // Cross-entity consistency: OrderFilledEvent token IDs should have matching Orderbook entries
    const orderFilledSets = result.changes.flatMap(
      (c: any) => c.OrderFilledEvent?.sets ?? [],
    );
    const orderbookSets = result.changes.flatMap(
      (c: any) => c.Orderbook?.sets ?? [],
    );
    expect(orderFilledSets.length).toBeGreaterThan(0);
    expect(orderbookSets.length).toBeGreaterThan(0);

    // Every Orderbook entry should have valid volume consistency
    for (const ob of orderbookSets) {
      expect(ob.collateralVolume).toBe(
        ob.collateralBuyVolume + ob.collateralSellVolume,
      );
      expect(ob.tradesQuantity).toBe(
        ob.buysQuantity + ob.sellsQuantity,
      );
      expect(ob.tradesQuantity).toBeGreaterThan(0n);
    }
  }, 60_000);

  // ============================================================
  // ConditionalTokens + Exchange interplay
  // ============================================================
  it("should process ConditionalTokens + Exchange interplay", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 33_605_403, endBlock: 33_606_000 },
      },
    });

    // MarketData entities from TokenRegistered
    const marketDataSets = result.changes.flatMap(
      (c: any) => c.MarketData?.sets ?? [],
    );

    // Orderbook entities from OrderFilled
    const orderbookSets = result.changes.flatMap(
      (c: any) => c.Orderbook?.sets ?? [],
    );

    // Verify MarketData structure if present
    for (const md of marketDataSets) {
      expect(typeof md.condition).toBe("string");
      expect(md.condition).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof md.id).toBe("string");
      // ID is token ID as string
      expect(md.id.length).toBeGreaterThan(0);
    }

    // Verify Orderbook structure and consistency
    for (const ob of orderbookSets) {
      expect(typeof ob.collateralVolume).toBe("bigint");
      expect(ob.collateralVolume).toBeGreaterThan(0n);
      expect(ob.collateralVolume).toBe(
        ob.collateralBuyVolume + ob.collateralSellVolume,
      );
      expect(ob.tradesQuantity).toBe(
        ob.buysQuantity + ob.sellsQuantity,
      );
      expect(Number.isFinite(Number(ob.scaledCollateralVolume))).toBe(true);
    }
  }, 30_000);

  // ============================================================
  // NegRisk + Exchange interplay
  // ============================================================
  it("should process NegRisk + Exchange interplay", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 55_725_073, endBlock: 55_725_130 },
      },
    });

    // OrderFilledEvent from Exchange/NegRiskExchange
    const orderFilledSets = result.changes.flatMap(
      (c: any) => c.OrderFilledEvent?.sets ?? [],
    );
    expect(orderFilledSets.length).toBeGreaterThan(0);

    // Validate all OrderFilledEvent entities
    for (const ofe of orderFilledSets) {
      expect(ofe.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
      expect(typeof ofe.timestamp).toBe("bigint");
      expect(ofe.timestamp).toBeGreaterThan(0n);
      expect(ofe.maker).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(ofe.taker).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(ofe.makerAmountFilled).toBeGreaterThan(0n);
      expect(ofe.takerAmountFilled).toBeGreaterThan(0n);
    }

    // UserPosition entities from PnL tracking
    const userPositionSets = result.changes.flatMap(
      (c: any) => c.UserPosition?.sets ?? [],
    );
    expect(userPositionSets.length).toBeGreaterThan(0);

    // Validate all UserPosition entities
    for (const up of userPositionSets) {
      expect(typeof up.avgPrice).toBe("bigint");
      expect(typeof up.amount).toBe("bigint");
      expect(typeof up.realizedPnl).toBe("bigint");
      expect(up.user).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof up.tokenId).toBe("bigint");
    }

    // Cross-entity: unique users from OrderFilled should overlap with UserPosition users
    const orderUsers = new Set<string>();
    for (const ofe of orderFilledSets) {
      orderUsers.add(ofe.maker.toLowerCase());
      orderUsers.add(ofe.taker.toLowerCase());
    }
    const positionUsers = new Set<string>();
    for (const up of userPositionSets) {
      positionUsers.add(up.user.toLowerCase());
    }
    // At least some UserPosition users should appear in OrderFilled events
    const overlap = [...positionUsers].filter((u) => orderUsers.has(u));
    expect(overlap.length).toBeGreaterThan(0);
  }, 60_000);

  // ============================================================
  // Full PnL lifecycle
  // ============================================================
  it("should track full PnL lifecycle with UserPosition", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 35_900_780, endBlock: 35_902_000 },
      },
    });

    // UserPosition entities should be created from trades
    const userPositionSets = result.changes.flatMap(
      (c: any) => c.UserPosition?.sets ?? [],
    );
    expect(userPositionSets.length).toBeGreaterThan(0);

    const COLLATERAL_SCALE = 1_000_000n;

    for (const up of userPositionSets) {
      expect(typeof up.avgPrice).toBe("bigint");
      expect(typeof up.amount).toBe("bigint");
      expect(typeof up.realizedPnl).toBe("bigint");
      expect(up.user).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof up.tokenId).toBe("bigint");
      // avgPrice should be valid for positions with amount > 0
      if (up.amount > 0n) {
        expect(up.avgPrice).toBeGreaterThan(0n);
        // avgPrice should be between 0 and COLLATERAL_SCALE ($0 to $1)
        expect(up.avgPrice).toBeLessThanOrEqual(COLLATERAL_SCALE);
      }
      // ID format: user-tokenId
      expect(up.id).toContain("-");
    }

    // OrdersMatchedGlobal should also be updated
    const global = await indexer.OrdersMatchedGlobal.get("");
    if (global) {
      expect(global.collateralVolume).toBeGreaterThan(0n);
      expect(global.tradesQuantity).toBeGreaterThan(0n);
      // Volume consistency
      expect(global.collateralVolume).toBe(
        global.collateralBuyVolume + global.collateralSellVolume,
      );
      expect(global.tradesQuantity).toBe(
        global.buysQuantity + global.sellsQuantity,
      );
    }
  }, 120_000);
});
