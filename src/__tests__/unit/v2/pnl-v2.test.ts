import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";
import "../../../handlers/v2/CTFExchangeV2.js";
import "../../../handlers/v2/CtfCollateralAdapter.js";
import "../../../handlers/ConditionalTokens.js";
import { getUserPositionEntityId } from "../../../utils/pnl.js";
import {
  CTF_COLLATERAL_ADAPTER,
  CONDITIONAL_TOKENS,
} from "../../../utils/constants.js";

const FIRST_V2_EXCHANGE =
  "0xe111180000d2663c0091e4f400237545b87b996b" as `0x${string}`;
const USER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const COUNTERPARTY = "0x2222222222222222222222222222222222222222" as `0x${string}`;
const ZERO_BYTES32 =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const ORDER_HASH =
  "0x1111111111111111111111111111111111111111111111111111111111111111";
const CONDITION_ID =
  "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const TOKEN_ID = 42n;

const orderFilled = (overrides: Record<string, unknown>) => ({
  contract: "CTFExchangeV2" as const,
  srcAddress: FIRST_V2_EXCHANGE,
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

describe("CTFExchangeV2 PnL", () => {
  it("BUY fill opens a UserPosition at the fill price", async () => {
    const indexer = createTestIndexer();

    // BUY: pay 1.00 pUSD for 2 tokens => price 0.50
    await indexer.process({
      chains: {
        137: {
          simulate: [
            orderFilled({
              side: 0n,
              makerAmountFilled: 1_000_000n,
              takerAmountFilled: 2_000_000n,
            }),
          ],
        },
      },
    });

    const pos = await indexer.UserPosition.getOrThrow(
      getUserPositionEntityId(USER, TOKEN_ID),
    );
    expect(pos.amount).toBe(2_000_000n);
    expect(pos.avgPrice).toBe(500_000n);
    expect(pos.totalBought).toBe(2_000_000n);
    expect(pos.realizedPnl).toBe(0n);
  });

  it("SELL fill realizes PnL against the average price", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            // Buy 2 tokens @ 0.50
            orderFilled({
              side: 0n,
              makerAmountFilled: 1_000_000n,
              takerAmountFilled: 2_000_000n,
            }),
            // Sell 2 tokens @ 0.75 (receive 1.50 pUSD)
            orderFilled({
              side: 1n,
              makerAmountFilled: 2_000_000n,
              takerAmountFilled: 1_500_000n,
            }),
          ],
        },
      },
    });

    const pos = await indexer.UserPosition.getOrThrow(
      getUserPositionEntityId(USER, TOKEN_ID),
    );
    expect(pos.amount).toBe(0n);
    // 2 tokens * (0.75 - 0.50) = 0.50 pUSD profit
    expect(pos.realizedPnl).toBe(500_000n);
  });

  it("counts SELL volume in collateral units, not token units", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            // SELL: give 4 tokens, receive 1.00 pUSD
            orderFilled({
              side: 1n,
              makerAmountFilled: 4_000_000n,
              takerAmountFilled: 1_000_000n,
            }),
          ],
        },
      },
    });

    const stats = await indexer.V2ExchangeStats.getAll();
    expect(stats[0]!.totalVolume).toBe(1_000_000n);
  });
});

describe("CtfCollateralAdapter PnL", () => {
  const POSITION_ID_0 = 1000n;
  const POSITION_ID_1 = 2000n;

  const seedCondition = (
    indexer: ReturnType<typeof createTestIndexer>,
    payoutNumerators: bigint[] = [],
    payoutDenominator = 0n,
  ) => {
    indexer.Condition.set({
      id: CONDITION_ID,
      positionIds: [POSITION_ID_0, POSITION_ID_1],
      payoutNumerators,
      payoutDenominator,
    });
  };

  it("split books a 50c buy of both outcomes for the stakeholder", async () => {
    const indexer = createTestIndexer();
    seedCondition(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CtfCollateralAdapter",
              srcAddress: CTF_COLLATERAL_ADAPTER,
              event: "PositionSplit",
              params: {
                stakeholder: USER,
                collateralToken: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
                parentCollectionId: ZERO_BYTES32,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 3_000_000n,
              },
            },
          ],
        },
      },
    });

    for (const positionId of [POSITION_ID_0, POSITION_ID_1]) {
      const pos = await indexer.UserPosition.getOrThrow(
        getUserPositionEntityId(USER, positionId),
      );
      expect(pos.amount).toBe(3_000_000n);
      expect(pos.avgPrice).toBe(500_000n);
    }
  });

  it("merge books a 50c sell of both outcomes for the stakeholder", async () => {
    const indexer = createTestIndexer();
    seedCondition(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CtfCollateralAdapter",
              srcAddress: CTF_COLLATERAL_ADAPTER,
              event: "PositionSplit",
              params: {
                stakeholder: USER,
                collateralToken: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
                parentCollectionId: ZERO_BYTES32,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 3_000_000n,
              },
            },
            {
              contract: "CtfCollateralAdapter",
              srcAddress: CTF_COLLATERAL_ADAPTER,
              event: "PositionsMerge",
              params: {
                stakeholder: USER,
                collateralToken: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
                parentCollectionId: ZERO_BYTES32,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 3_000_000n,
              },
            },
          ],
        },
      },
    });

    for (const positionId of [POSITION_ID_0, POSITION_ID_1]) {
      const pos = await indexer.UserPosition.getOrThrow(
        getUserPositionEntityId(USER, positionId),
      );
      expect(pos.amount).toBe(0n);
      expect(pos.realizedPnl).toBe(0n); // bought and sold at 50c
    }
  });

  it("redemption realizes payout-price PnL on resolved conditions", async () => {
    const indexer = createTestIndexer();
    // Outcome 0 wins: payout numerators [1, 0]
    seedCondition(indexer, [1n, 0n], 1n);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CtfCollateralAdapter",
              srcAddress: CTF_COLLATERAL_ADAPTER,
              event: "PositionSplit",
              params: {
                stakeholder: USER,
                collateralToken: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
                parentCollectionId: ZERO_BYTES32,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 2_000_000n,
              },
            },
            {
              contract: "CtfCollateralAdapter",
              srcAddress: CTF_COLLATERAL_ADAPTER,
              event: "PayoutRedemption",
              params: {
                redeemer: USER,
                collateralToken: "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb",
                parentCollectionId: ZERO_BYTES32,
                conditionId: CONDITION_ID,
                indexSets: [1n, 2n],
                payout: 2_000_000n,
              },
            },
          ],
        },
      },
    });

    // Winning outcome: bought @ 0.50, redeemed @ 1.00 => +0.50 * 2 = 1.00
    const winner = await indexer.UserPosition.getOrThrow(
      getUserPositionEntityId(USER, POSITION_ID_0),
    );
    expect(winner.amount).toBe(0n);
    expect(winner.realizedPnl).toBe(1_000_000n);

    // Losing outcome: bought @ 0.50, redeemed @ 0 => -0.50 * 2 = -1.00
    const loser = await indexer.UserPosition.getOrThrow(
      getUserPositionEntityId(USER, POSITION_ID_1),
    );
    expect(loser.amount).toBe(0n);
    expect(loser.realizedPnl).toBe(-1_000_000n);
  });
});

describe("ConditionalTokens skips V2 intermediaries", () => {
  it("does not book activity or PnL for CTF splits by the CtfCollateralAdapter", async () => {
    const indexer = createTestIndexer();
    indexer.Condition.set({
      id: CONDITION_ID,
      positionIds: [1000n, 2000n],
      payoutNumerators: [],
      payoutDenominator: 0n,
    });

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "ConditionalTokens",
              srcAddress: CONDITIONAL_TOKENS,
              event: "PositionSplit",
              params: {
                stakeholder: CTF_COLLATERAL_ADAPTER,
                collateralToken: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
                parentCollectionId: ZERO_BYTES32,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 5_000_000n,
              },
            },
          ],
        },
      },
    });

    // No junk Split activity entity for the adapter
    const splits = await indexer.Split.getAll();
    expect(splits.length).toBe(0);

    // No phantom UserPosition for the adapter address
    const positions = await indexer.UserPosition.getAll();
    expect(positions.length).toBe(0);

    // But open interest still tracks the USDC locked in the CTF
    const oi = await indexer.GlobalOpenInterest.getAll();
    expect(oi[0]?.amount).toBe(5_000_000n);
  });
});
