import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";
import { SIM_BLOCK } from "../simBlock.js";

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
              block: SIM_BLOCK,
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
              block: SIM_BLOCK,
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
              block: SIM_BLOCK,
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
              block: SIM_BLOCK,
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
              block: SIM_BLOCK,
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
              block: SIM_BLOCK,
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

describe("Proxy wallet USDC balance tracking (address casing)", () => {
  it("updates a proxy wallet's balance from a checksummed USDC Transfer", async () => {
    const indexer = createTestIndexer();
    const { computeProxyWalletAddress } = await import("../../utils/wallet.js");
    const { getAddress } = await import("viem");
    const {
      PROXY_WALLET_FACTORY: FACTORY,
      PROXY_WALLET_IMPLEMENTATION: IMPL,
    } = await import("../../utils/constants.js");

    const walletAddress = computeProxyWalletAddress(
      ALICE as `0x${string}`,
      FACTORY as `0x${string}`,
      IMPL as `0x${string}`,
    );
    // The computed id must be EIP-55 checksummed so that envio's
    // checksummed event params match it on lookup
    expect(walletAddress).toBe(getAddress(walletAddress));

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              block: SIM_BLOCK,
              contract: "RelayHub",
              event: "TransactionRelayed",
              params: {
                relay: BOB as `0x${string}`,
                from: ALICE as `0x${string}`,
                to: PROXY_WALLET_FACTORY as `0x${string}`,
                selector: "0x12345678",
                status: 0n,
                charge: 0n,
              },
            },
            {
              contract: "USDC",
              event: "Transfer",
              params: {
                // checksummed, as envio delivers event params
                from: getAddress(BOB),
                to: walletAddress,
                amount: 7_000_000n,
              },
            },
          ],
        },
      },
    });

    const wallet = await indexer.Wallet.get(walletAddress);
    expect(wallet).toBeDefined();
    expect(wallet!.type).toBe("proxy");
    expect(wallet!.balance).toBe(7_000_000n);
  });
});
