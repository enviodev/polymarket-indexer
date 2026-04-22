import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../../handlers/v2/CTFExchangeV2.js";

const FIRST_V2_EXCHANGE = "0xe111180000d2663c0091e4f400237545b87b996b";
const MAKER = "0x1111111111111111111111111111111111111111";
const TAKER = "0x2222222222222222222222222222222222222222";
const RECEIVER = "0x3333333333333333333333333333333333333333";
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const NONZERO_BUILDER =
  "0x0000000000000000000000000000000000000000000000000000000000000abc";
const ORDER_HASH_1 =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const ORDER_HASH_2 =
  "0x2222222222222222222222222222222222222222222222222222222222222222";

describe("CTFExchangeV2.OrderFilled", () => {
  it("creates a V2OrderFill with the expected field shape and bumps stats", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CTFExchangeV2",
              srcAddress: FIRST_V2_EXCHANGE,
              event: "OrderFilled",
              params: {
                orderHash: ORDER_HASH_1,
                maker: MAKER,
                taker: TAKER,
                side: 0n,
                tokenId: 42n,
                makerAmountFilled: 1_000_000n,
                takerAmountFilled: 2_000_000n,
                fee: 10_000n,
                builder: NONZERO_BUILDER,
                metadata: ZERO_BYTES32,
              },
            },
          ],
        },
      },
    });

    const fills = await indexer.V2OrderFill.getAll();
    expect(fills.length).toBe(1);
    const fill = fills[0]!;
    expect(fill.orderHash).toBe(ORDER_HASH_1);
    expect(fill.side).toBe(0);
    expect(fill.tokenId).toBe(42n);
    expect(fill.builder).toBe(NONZERO_BUILDER);
    expect(fill.exchange.toLowerCase()).toBe(FIRST_V2_EXCHANGE);
    expect(fill.makerAmountFilled).toBe(1_000_000n);
    expect(fill.takerAmountFilled).toBe(2_000_000n);
    expect(fill.fee).toBe(10_000n);

    const stats = await indexer.V2ExchangeStats.getAll();
    expect(stats.length).toBe(1);
    const s = stats[0]!;
    expect(s.totalOrdersFilled).toBe(1n);
    expect(s.totalVolume).toBe(1_000_000n);
    expect(s.totalFees).toBe(10_000n);
    expect(s.totalBuilderFills).toBe(1n);
  });

  it("does not bump totalBuilderFills when builder is zero", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CTFExchangeV2",
              srcAddress: FIRST_V2_EXCHANGE,
              event: "OrderFilled",
              params: {
                orderHash: ORDER_HASH_2,
                maker: MAKER,
                taker: TAKER,
                side: 1n,
                tokenId: 100n,
                makerAmountFilled: 500_000n,
                takerAmountFilled: 250_000n,
                fee: 5_000n,
                builder: ZERO_BYTES32,
                metadata: ZERO_BYTES32,
              },
            },
          ],
        },
      },
    });

    const stats = await indexer.V2ExchangeStats.getAll();
    expect(stats[0]!.totalBuilderFills).toBe(0n);
    expect(stats[0]!.totalOrdersFilled).toBe(1n);
  });
});

describe("CTFExchangeV2.OrdersMatched", () => {
  it("creates a V2OrderMatch and bumps totalOrdersMatched", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CTFExchangeV2",
              srcAddress: FIRST_V2_EXCHANGE,
              event: "OrdersMatched",
              params: {
                takerOrderHash: ORDER_HASH_1,
                takerOrderMaker: MAKER,
                side: 0n,
                tokenId: 7n,
                makerAmountFilled: 900_000n,
                takerAmountFilled: 1_800_000n,
              },
            },
          ],
        },
      },
    });

    const matches = await indexer.V2OrderMatch.getAll();
    expect(matches.length).toBe(1);
    expect(matches[0]!.tokenId).toBe(7n);
    expect(matches[0]!.exchange.toLowerCase()).toBe(FIRST_V2_EXCHANGE);

    const stats = await indexer.V2ExchangeStats.getAll();
    expect(stats[0]!.totalOrdersMatched).toBe(1n);
  });
});

describe("CTFExchangeV2.FeeCharged", () => {
  it("creates a V2FeeEvent", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CTFExchangeV2",
              srcAddress: FIRST_V2_EXCHANGE,
              event: "FeeCharged",
              params: { receiver: RECEIVER, amount: 25_000n },
            },
          ],
        },
      },
    });

    const fees = await indexer.V2FeeEvent.getAll();
    expect(fees.length).toBe(1);
    expect(fees[0]!.receiver.toLowerCase()).toBe(RECEIVER);
    expect(fees[0]!.amount).toBe(25_000n);
  });
});
