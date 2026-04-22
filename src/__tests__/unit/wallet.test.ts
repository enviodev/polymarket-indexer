import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../handlers/Wallet.js";

// The proxy wallet factory — must match the PROXY_WALLET_FACTORY constant in src/utils/constants.ts
const PROXY_WALLET_FACTORY = "0xab45c5a4b0c941a2f231c04c3f49182e1a254052";
const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";
const UNKNOWN = "0x3333333333333333333333333333333333333333";

describe("SafeProxyFactory.ProxyCreation", () => {
  it("creates a Wallet entity from ProxyCreation event", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "SafeProxyFactory",
              event: "ProxyCreation",
              params: { proxy: ALICE, owner: BOB },
            },
          ],
        },
      },
    });

    const wallet = await indexer.Wallet.get(ALICE);
    expect(wallet).toBeDefined();
    expect(wallet!.signer.toLowerCase()).toBe(BOB);
    expect(wallet!.type).toBe("safe");
    expect(wallet!.balance).toBe(0n);
  });
});

describe("RelayHub.TransactionRelayed (proxy wallet detection)", () => {
  it("creates a Wallet with type=proxy when to matches PROXY_WALLET_FACTORY", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "RelayHub",
              event: "TransactionRelayed",
              params: {
                relay: ALICE,
                from: BOB,
                to: PROXY_WALLET_FACTORY,
                selector: "0x12345678",
                status: 0n,
                charge: 0n,
              },
            },
          ],
        },
      },
    });

    // Wallet ID is the computed deterministic proxy address, not `from`.
    // Just check one was registered and its signer is `from`.
    const wallets = await indexer.Wallet.getAll();
    expect(wallets.length).toBe(1);
    expect(wallets[0]!.type).toBe("proxy");
    expect(wallets[0]!.signer.toLowerCase()).toBe(BOB);
  });

  it("does NOT create a Wallet when to is not PROXY_WALLET_FACTORY", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "RelayHub",
              event: "TransactionRelayed",
              params: {
                relay: ALICE,
                from: BOB,
                to: UNKNOWN,
                selector: "0x12345678",
                status: 0n,
                charge: 0n,
              },
            },
          ],
        },
      },
    });

    const wallets = await indexer.Wallet.getAll();
    expect(wallets.length).toBe(0);
  });
});

describe("USDC.Transfer (balance tracking)", () => {
  it("updates wallet balance on incoming USDC transfer when recipient is a known wallet", async () => {
    const indexer = createTestIndexer();

    // Seed a known wallet
    indexer.Wallet.set({
      id: BOB,
      signer: BOB,
      type: "safe",
      balance: 0n,
      lastTransfer: 0n,
      createdAt: 0n,
    });

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "USDC",
              event: "Transfer",
              params: { from: UNKNOWN, to: BOB, amount: 1_500n },
            },
          ],
        },
      },
    });

    const wallet = await indexer.Wallet.get(BOB);
    expect(wallet!.balance).toBe(1_500n);
  });

  it("decrements wallet balance on outgoing USDC transfer when sender is a known wallet", async () => {
    const indexer = createTestIndexer();

    indexer.Wallet.set({
      id: ALICE,
      signer: ALICE,
      type: "safe",
      balance: 5_000n,
      lastTransfer: 0n,
      createdAt: 0n,
    });

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "USDC",
              event: "Transfer",
              params: { from: ALICE, to: UNKNOWN, amount: 1_500n },
            },
          ],
        },
      },
    });

    const wallet = await indexer.Wallet.get(ALICE);
    expect(wallet!.balance).toBe(3_500n);
  });

  it("does NOT create entities when neither sender nor receiver is a known Wallet", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "USDC",
              event: "Transfer",
              params: { from: UNKNOWN, to: ALICE, amount: 500n },
            },
          ],
        },
      },
    });

    expect((await indexer.Wallet.getAll()).length).toBe(0);
  });
});
