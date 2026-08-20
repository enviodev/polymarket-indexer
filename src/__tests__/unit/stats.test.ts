import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";
import { SIM_BLOCK } from "../simBlock.js";

const FIRST_V2_EXCHANGE =
  "0xe111180000d2663c0091e4f400237545b87b996b" as `0x${string}`;
const V1_EXCHANGE =
  "0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E" as `0x${string}`;
const USER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const COUNTERPARTY =
  "0x2222222222222222222222222222222222222222" as `0x${string}`;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const BUILDER =
  "0xb111de1000000000000000000000000000000000000000000000000000000001";
const ORDER_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const TOKEN_ID = 42n;
const TS = 1_755_000_000;

const SIM_BLOCK_TS = { ...SIM_BLOCK, timestamp: TS };

const v2Fill = (overrides: Record<string, unknown>) => ({
  contract: "CTFExchangeV2" as const,
  srcAddress: FIRST_V2_EXCHANGE,
  block: SIM_BLOCK_TS,
  event: "OrderFilled" as const,
  params: {
    orderHash: ORDER_HASH,
    maker: USER,
    taker: COUNTERPARTY,
    side: 0n,
    tokenId: TOKEN_ID,
    makerAmountFilled: 0n,
    takerAmountFilled: 0n,
    fee: 0n,
    builder: ZERO_BYTES32,
    metadata: ZERO_BYTES32,
    ...overrides,
  },
});

describe("UserStats", () => {
  it("books maker-side volume, trades, and fees on a V2 fill", async () => {
    const indexer = createTestIndexer();

    // BUY: pay 1.00 pUSD for 2 tokens, 0.01 fee
    await indexer.process({
      chains: {
        137: {
          simulate: [
            v2Fill({
              makerAmountFilled: 1_000_000n,
              takerAmountFilled: 2_000_000n,
              fee: 10_000n,
            }),
          ],
        },
      },
    });

    const stats = await indexer.UserStats.getOrThrow(USER);
    expect(stats.volume).toBe(1_000_000n);
    expect(stats.trades).toBe(1n);
    expect(stats.feesPaid).toBe(10_000n);
    expect(stats.lastTradeTimestamp).toBe(TS);
    expect(stats.realizedPnl).toBe(0n);
  });

  it("keeps realizedPnl in lockstep with UserPosition across a round trip", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            // Buy 2 tokens @ 0.50
            v2Fill({
              side: 0n,
              makerAmountFilled: 1_000_000n,
              takerAmountFilled: 2_000_000n,
            }),
            // Sell 2 tokens @ 0.75 (receive 1.50 pUSD)
            v2Fill({
              side: 1n,
              makerAmountFilled: 2_000_000n,
              takerAmountFilled: 1_500_000n,
            }),
          ],
        },
      },
    });

    const stats = await indexer.UserStats.getOrThrow(USER);
    // 2 tokens * (0.75 - 0.50) = 0.50 pUSD profit
    expect(stats.realizedPnl).toBe(500_000n);
    expect(stats.trades).toBe(2n);
    // 1.00 buy + 1.50 sell, both in collateral units
    expect(stats.volume).toBe(2_500_000n);
  });

  it("books V1 exchange fills for the maker", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              block: SIM_BLOCK_TS,
              contract: "Exchange",
              srcAddress: V1_EXCHANGE,
              event: "OrderFilled",
              params: {
                orderHash: ORDER_HASH,
                maker: USER,
                taker: COUNTERPARTY,
                makerAssetId: 0n, // BUY: maker pays collateral
                takerAssetId: TOKEN_ID,
                makerAmountFilled: 3_000_000n,
                takerAmountFilled: 4_000_000n,
                fee: 5_000n,
              },
            },
          ],
        },
      },
    });

    const stats = await indexer.UserStats.getOrThrow(USER);
    expect(stats.volume).toBe(3_000_000n);
    expect(stats.trades).toBe(1n);
    expect(stats.feesPaid).toBe(5_000n);
  });
});

describe("BuilderStats", () => {
  it("aggregates fills carrying a builder code", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            v2Fill({
              builder: BUILDER,
              makerAmountFilled: 1_000_000n,
              takerAmountFilled: 2_000_000n,
              fee: 10_000n,
            }),
            v2Fill({
              builder: BUILDER,
              side: 1n,
              makerAmountFilled: 2_000_000n,
              takerAmountFilled: 1_500_000n,
              fee: 15_000n,
            }),
          ],
        },
      },
    });

    const stats = await indexer.BuilderStats.getOrThrow(BUILDER);
    expect(stats.fills).toBe(2n);
    expect(stats.volume).toBe(2_500_000n);
    expect(stats.fees).toBe(25_000n);
    expect(stats.firstSeenAt).toBe(TS);
    expect(stats.lastSeenAt).toBe(TS);
  });

  it("ignores fills with the zero builder code", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            v2Fill({
              makerAmountFilled: 1_000_000n,
              takerAmountFilled: 2_000_000n,
            }),
          ],
        },
      },
    });

    expect((await indexer.BuilderStats.getAll()).length).toBe(0);
  });
});
