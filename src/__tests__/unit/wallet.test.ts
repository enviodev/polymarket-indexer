import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";
import { getAddress } from "viem";
import { SIM_BLOCK } from "../simBlock.js";
import { computeProxyWalletAddress } from "../../utils/wallet.js";
import {
  PROXY_WALLET_FACTORY,
  PROXY_WALLET_IMPLEMENTATION,
} from "../../utils/constants.js";

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

  it("registers the wallet under its EIP-55 checksummed proxy address", async () => {
    const indexer = createTestIndexer();

    const walletAddress = computeProxyWalletAddress(
      ALICE as `0x${string}`,
      PROXY_WALLET_FACTORY as `0x${string}`,
      PROXY_WALLET_IMPLEMENTATION as `0x${string}`,
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
          ],
        },
      },
    });

    const wallet = await indexer.Wallet.get(walletAddress);
    expect(wallet).toBeDefined();
    expect(wallet!.type).toBe("proxy");
  });
});
