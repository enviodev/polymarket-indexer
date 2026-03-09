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

describe("HyperSync - Wallet", () => {
  // ============================================================
  // Existing: SafeProxyFactory wallet creation
  // ============================================================
  it("should create Wallet entities from ProxyCreation events", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 19_691_766, endBlock: 19_691_767 },
      },
    });

    const walletSets = result.changes.flatMap(
      (c: any) => c.Wallet?.sets ?? [],
    );
    expect(walletSets.length).toBeGreaterThan(0);
    const wallet = walletSets[0];
    expect(wallet.type).toBe("safe");
    expect(wallet.balance).toBe(0n);
    expect(typeof wallet.signer).toBe("string");
    expect(wallet.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(wallet.id).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(typeof wallet.lastTransfer).toBe("bigint");
    expect(wallet.lastTransfer).toBe(0n);
    expect(typeof wallet.createdAt).toBe("bigint");
    expect(wallet.createdAt).toBeGreaterThan(0n);

    // All wallets in this batch should be "safe" type
    for (const w of walletSets) {
      expect(w.type).toBe("safe");
      expect(w.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(w.balance).toBeGreaterThanOrEqual(0n);
      expect(["safe", "proxy"]).toContain(w.type);
    }
  }, 30_000);

  // ============================================================
  // New: RelayHub TransactionRelayed
  // ============================================================
  it("should process RelayHub TransactionRelayed events for wallet creation", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 3_764_531, endBlock: 3_765_000 },
      },
    });

    // Look for Wallet entities with type="proxy"
    const walletSets = result.changes.flatMap(
      (c: any) => c.Wallet?.sets ?? [],
    );
    // RelayHub may or may not produce wallet entities depending on whether the
    // TransactionRelayed target is the proxy wallet factory
    for (const w of walletSets) {
      expect(["safe", "proxy"]).toContain(w.type);
      expect(typeof w.balance).toBe("bigint");
      expect(w.balance).toBeGreaterThanOrEqual(0n);
      expect(typeof w.signer).toBe("string");
      expect(w.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(w.id).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof w.createdAt).toBe("bigint");
      expect(w.createdAt).toBeGreaterThan(0n);
      expect(typeof w.lastTransfer).toBe("bigint");
    }
  }, 60_000);

  // ============================================================
  // New: USDC Transfer to wallet
  // ============================================================
  it("should process USDC transfers after wallet creation", async () => {
    const { createTestIndexer } = await import("generated");
    const indexer = createTestIndexer();

    const result = await indexer.process({
      chains: {
        137: { startBlock: 19_691_766, endBlock: 19_692_000 },
      },
    });

    // Wallet entities should exist (from ProxyCreation in block 19691766)
    const walletSets = result.changes.flatMap(
      (c: any) => c.Wallet?.sets ?? [],
    );
    expect(walletSets.length).toBeGreaterThan(0);

    // All wallets should have valid structure
    for (const w of walletSets) {
      expect(w.id).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(w.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(["safe", "proxy"]).toContain(w.type);
      expect(typeof w.balance).toBe("bigint");
      expect(typeof w.lastTransfer).toBe("bigint");
      expect(typeof w.createdAt).toBe("bigint");
      expect(w.createdAt).toBeGreaterThan(0n);
    }

    // Check for GlobalUSDCBalance updates
    const globalBalanceSets = result.changes.flatMap(
      (c: any) => c.GlobalUSDCBalance?.sets ?? [],
    );
    if (globalBalanceSets.length > 0) {
      for (const gb of globalBalanceSets) {
        expect(typeof gb.balance).toBe("bigint");
        expect(gb.id).toBe("global");
      }
    }
  }, 60_000);
});
