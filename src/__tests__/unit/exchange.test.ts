import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../handlers/Exchange.js";

const MAKER = "0x1111111111111111111111111111111111111111";
const TAKER = "0x2222222222222222222222222222222222222222";
const ORDER_HASH =
  "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";

describe("Exchange.OrderFilled", () => {
  it("creates an OrderFilledEvent and Orderbook for a BUY (makerAssetId=0)", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Exchange",
              event: "OrderFilled",
              params: {
                orderHash: ORDER_HASH,
                maker: MAKER,
                taker: TAKER,
                makerAssetId: 0n,
                takerAssetId: 42n,
                makerAmountFilled: 1_000_000n,
                takerAmountFilled: 2_000_000n,
                fee: 0n,
              },
            },
          ],
        },
      },
    });

    const fills = await indexer.OrderFilledEvent.getAll();
    expect(fills.length).toBe(1);
    const f = fills[0]!;
    expect(f.orderHash).toBe(ORDER_HASH);
    expect(f.makerAmountFilled).toBe(1_000_000n);

    // For a BUY: tokenId = takerAssetId (42)
    const orderbook = await indexer.Orderbook.get("42");
    expect(orderbook).toBeDefined();
    expect(orderbook!.tradesQuantity).toBe(1n);
    expect(orderbook!.buysQuantity).toBe(1n);
    expect(orderbook!.collateralVolume).toBe(1_000_000n);
  });

  it("creates an OrderFilledEvent and Orderbook for a SELL (makerAssetId!=0)", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Exchange",
              event: "OrderFilled",
              params: {
                orderHash: ORDER_HASH,
                maker: MAKER,
                taker: TAKER,
                makerAssetId: 42n,
                takerAssetId: 0n,
                makerAmountFilled: 500_000n,
                takerAmountFilled: 1_000_000n,
                fee: 0n,
              },
            },
          ],
        },
      },
    });

    // For a SELL: tokenId = makerAssetId (42), size = takerAmountFilled
    const orderbook = await indexer.Orderbook.get("42");
    expect(orderbook!.sellsQuantity).toBe(1n);
    expect(orderbook!.collateralVolume).toBe(1_000_000n);
  });
});

describe("Exchange.OrdersMatched", () => {
  it("creates an OrdersMatchedEvent and updates OrdersMatchedGlobal", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Exchange",
              event: "OrdersMatched",
              params: {
                takerOrderHash: ORDER_HASH,
                takerOrderMaker: MAKER,
                makerAssetId: 0n,
                takerAssetId: 42n,
                makerAmountFilled: 1_000_000n,
                takerAmountFilled: 2_000_000n,
              },
            },
          ],
        },
      },
    });

    const matched = await indexer.OrdersMatchedEvent.getAll();
    expect(matched.length).toBe(1);

    const global = await indexer.OrdersMatchedGlobal.get("");
    expect(global).toBeDefined();
    expect(global!.tradesQuantity).toBe(1n);
  });
});

describe("Exchange.TokenRegistered", () => {
  it("creates MarketData entries for both tokens", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "Exchange",
              event: "TokenRegistered",
              params: { token0: 11n, token1: 22n, conditionId: CONDITION_ID },
            },
          ],
        },
      },
    });

    const m0 = await indexer.MarketData.get("11");
    const m1 = await indexer.MarketData.get("22");
    expect(m0).toBeDefined();
    expect(m1).toBeDefined();
    expect(m0!.condition).toBe(CONDITION_ID);
  });
});
