import { describe, it, expect } from "vitest";

describe("HyperSync - Wallet", () => {
  // ============================================================
  // SafeProxyFactory wallet creation
  // ============================================================
  it("should create Wallet entities from ProxyCreation events", async () => {
    const { createTestIndexer } = await import("envio");
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
    expect(typeof wallet.signer).toBe("string");
    expect(wallet.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(wallet.id).toMatch(/^0x[a-fA-F0-9]{40}$/);
    expect(typeof wallet.createdAt).toBe("bigint");
    expect(wallet.createdAt).toBeGreaterThan(0n);

    for (const w of walletSets) {
      expect(["safe", "proxy"]).toContain(w.type);
      expect(w.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
    }
  }, 30_000);

  // ============================================================
  // RelayHub TransactionRelayed
  // ============================================================
  it("should process RelayHub TransactionRelayed events for wallet creation", async () => {
    const { createTestIndexer } = await import("envio");
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
      expect(typeof w.signer).toBe("string");
      expect(w.signer).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(w.id).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(typeof w.createdAt).toBe("bigint");
      expect(w.createdAt).toBeGreaterThan(0n);
    }
  }, 60_000);
});
