import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../../handlers/v2/PolyUSD.js";

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const ALICE = "0x1111111111111111111111111111111111111111";
const BOB = "0x2222222222222222222222222222222222222222";
const USDC = "0x2791bca1f2de4661ed88a30c99a7a9449aa84174";

describe("PolyUSD.Transfer", () => {
  it("creates a V2PolyUSDTransfer entity with correct fields", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "PolyUSD",
              event: "Transfer",
              params: { from: ALICE, to: BOB, amount: 1_000_000n },
            },
          ],
        },
      },
    });

    const transfers = await indexer.V2PolyUSDTransfer.getAll();
    expect(transfers.length).toBe(1);
    expect(transfers[0]!.from.toLowerCase()).toBe(ALICE);
    expect(transfers[0]!.to.toLowerCase()).toBe(BOB);
    expect(transfers[0]!.amount).toBe(1_000_000n);
  });

  it("debits sender and credits receiver", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "PolyUSD",
              event: "Transfer",
              params: { from: ALICE, to: BOB, amount: 1_000_000n },
            },
          ],
        },
      },
    });

    const alice = await indexer.V2PolyUSDAccount.get(ALICE);
    const bob = await indexer.V2PolyUSDAccount.get(BOB);
    expect(alice!.balance).toBe(-1_000_000n);
    expect(bob!.balance).toBe(1_000_000n);
  });

  it("increases totalSupply on mint (from zero) and does NOT create account for zero", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "PolyUSD",
              event: "Transfer",
              params: { from: ZERO_ADDR, to: BOB, amount: 5_000_000n },
            },
          ],
        },
      },
    });

    const stats = await indexer.V2PolyUSDStats.get("polyusd");
    expect(stats!.totalSupply).toBe(5_000_000n);

    const zero = await indexer.V2PolyUSDAccount.get(ZERO_ADDR);
    expect(zero).toBeUndefined();
  });

  it("decreases totalSupply on burn (to zero)", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "PolyUSD",
              event: "Transfer",
              params: { from: ZERO_ADDR, to: ALICE, amount: 5_000_000n },
            },
            {
              contract: "PolyUSD",
              event: "Transfer",
              params: { from: ALICE, to: ZERO_ADDR, amount: 2_000_000n },
            },
          ],
        },
      },
    });

    const stats = await indexer.V2PolyUSDStats.get("polyusd");
    expect(stats!.totalSupply).toBe(3_000_000n);
  });
});

describe("PolyUSD.Wrapped", () => {
  it("records wrap and bumps account.totalWrapped + stats.totalWrapped", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "PolyUSD",
              event: "Wrapped",
              params: {
                caller: ALICE,
                asset: USDC,
                to: BOB,
                amount: 3_000_000n,
              },
            },
          ],
        },
      },
    });

    const wraps = await indexer.V2PolyUSDWrap.getAll();
    expect(wraps[0]!.eventType).toBe("wrap");
    expect(wraps[0]!.amount).toBe(3_000_000n);

    const bob = await indexer.V2PolyUSDAccount.get(BOB);
    expect(bob!.totalWrapped).toBe(3_000_000n);

    const stats = await indexer.V2PolyUSDStats.get("polyusd");
    expect(stats!.totalWrapped).toBe(3_000_000n);
  });
});

describe("PolyUSD.Unwrapped", () => {
  it("records unwrap and bumps caller.totalUnwrapped + stats.totalUnwrapped", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "PolyUSD",
              event: "Unwrapped",
              params: {
                caller: ALICE,
                asset: USDC,
                to: BOB,
                amount: 1_500_000n,
              },
            },
          ],
        },
      },
    });

    const unwraps = await indexer.V2PolyUSDWrap.getAll();
    expect(unwraps[0]!.eventType).toBe("unwrap");
    expect(unwraps[0]!.amount).toBe(1_500_000n);

    const alice = await indexer.V2PolyUSDAccount.get(ALICE);
    expect(alice!.totalUnwrapped).toBe(1_500_000n);

    const stats = await indexer.V2PolyUSDStats.get("polyusd");
    expect(stats!.totalUnwrapped).toBe(1_500_000n);
  });
});
