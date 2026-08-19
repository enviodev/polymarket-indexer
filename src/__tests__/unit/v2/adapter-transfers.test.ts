import { describe, it, expect } from "vitest";
import { createTestIndexer } from "envio";
import { SIM_BLOCK } from "../../simBlock.js";
import { getUserPositionEntityId } from "../../../utils/pnl.js";
import {
  CONDITIONAL_TOKENS,
  CTF_COLLATERAL_ADAPTER,
} from "../../../utils/constants.js";

const USER = "0x1111111111111111111111111111111111111111" as `0x${string}`;
const V2_EXCHANGE =
  "0xe111180000d2663c0091e4f400237545b87b996b" as `0x${string}`;
const ADAPTER = CTF_COLLATERAL_ADAPTER as `0x${string}`;
const CONDITION_ID =
  "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const POSITION_ID_0 = 1000n;
const POSITION_ID_1 = 2000n;

function seed(
  indexer: ReturnType<typeof createTestIndexer>,
  payoutNumerators: bigint[] = [],
  payoutDenominator = 0n,
) {
  indexer.Condition.set({
    chainId: 137,
    id: CONDITION_ID,
    positionIds: [POSITION_ID_0, POSITION_ID_1],
    payoutNumerators,
    payoutDenominator,
  });
  for (const [i, id] of [POSITION_ID_0, POSITION_ID_1].entries()) {
    indexer.Position.set({
      chainId: 137,
      id: id.toString(),
      condition: CONDITION_ID,
      outcomeIndex: BigInt(i),
    });
  }
}

const transferBatch = (
  from: `0x${string}`,
  to: `0x${string}`,
  ids: bigint[],
  values: bigint[],
) => ({
  contract: "ConditionalTokens" as const,
  srcAddress: CONDITIONAL_TOKENS as `0x${string}`,
  block: SIM_BLOCK,
  event: "TransferBatch" as const,
  params: { operator: from, from, to, ids, values },
});

describe("V2 adapter ERC1155 attribution", () => {
  it("books redemption PnL when a user surrenders tokens to the adapter (resolved)", async () => {
    const indexer = createTestIndexer();
    seed(indexer, [1n, 0n], 1n); // outcome 0 wins

    // User holds both outcomes at 0.50 basis (seeded directly)
    for (const [i, id] of [POSITION_ID_0, POSITION_ID_1].entries()) {
      indexer.UserPosition.set({
        chainId: 137,
        id: getUserPositionEntityId(USER, id),
        user: USER,
        tokenId: id,
        amount: 2_000_000n,
        avgPrice: 500_000n,
        realizedPnl: 0n,
        totalBought: 2_000_000n,
      });
    }

    await indexer.process({
      chains: {
        137: {
          simulate: [
            transferBatch(
              USER,
              ADAPTER,
              [POSITION_ID_0, POSITION_ID_1],
              [2_000_000n, 2_000_000n],
            ),
          ],
        },
      },
    });

    // Winner sold @ 1.00 vs 0.50 basis => +1.00; loser @ 0 vs 0.50 => -1.00
    const winner = await indexer.UserPosition.getOrThrow(
      getUserPositionEntityId(USER, POSITION_ID_0),
    );
    expect(winner.amount).toBe(0n);
    expect(winner.realizedPnl).toBe(1_000_000n);

    const loser = await indexer.UserPosition.getOrThrow(
      getUserPositionEntityId(USER, POSITION_ID_1),
    );
    expect(loser.amount).toBe(0n);
    expect(loser.realizedPnl).toBe(-1_000_000n);
  });

  it("books a 50c merge-sell when surrendering to the adapter unresolved", async () => {
    const indexer = createTestIndexer();
    seed(indexer); // unresolved

    indexer.UserPosition.set({
      chainId: 137,
      id: getUserPositionEntityId(USER, POSITION_ID_0),
      user: USER,
      tokenId: POSITION_ID_0,
      amount: 4_000_000n,
      avgPrice: 300_000n,
      realizedPnl: 0n,
      totalBought: 4_000_000n,
    });

    await indexer.process({
      chains: {
        137: {
          simulate: [
            transferBatch(USER, ADAPTER, [POSITION_ID_0], [4_000_000n]),
          ],
        },
      },
    });

    // Sold 4 @ 0.50 vs 0.30 basis => +0.80
    const pos = await indexer.UserPosition.getOrThrow(
      getUserPositionEntityId(USER, POSITION_ID_0),
    );
    expect(pos.amount).toBe(0n);
    expect(pos.realizedPnl).toBe(800_000n);
  });

  it("books a 50c buy when the adapter sends split tokens to a user", async () => {
    const indexer = createTestIndexer();
    seed(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            transferBatch(
              ADAPTER,
              USER,
              [POSITION_ID_0, POSITION_ID_1],
              [3_000_000n, 3_000_000n],
            ),
          ],
        },
      },
    });

    for (const id of [POSITION_ID_0, POSITION_ID_1]) {
      const pos = await indexer.UserPosition.getOrThrow(
        getUserPositionEntityId(USER, id),
      );
      expect(pos.amount).toBe(3_000_000n);
      expect(pos.avgPrice).toBe(500_000n);
    }
  });

  it("ignores adapter <-> exchange hops and mints", async () => {
    const indexer = createTestIndexer();
    seed(indexer);

    await indexer.process({
      chains: {
        137: {
          simulate: [
            // mint to adapter
            transferBatch(
              "0x0000000000000000000000000000000000000000",
              ADAPTER,
              [POSITION_ID_0, POSITION_ID_1],
              [5_000_000n, 5_000_000n],
            ),
            // adapter hands to exchange for order matching
            transferBatch(
              ADAPTER,
              V2_EXCHANGE,
              [POSITION_ID_0, POSITION_ID_1],
              [5_000_000n, 5_000_000n],
            ),
          ],
        },
      },
    });

    const positions = await indexer.UserPosition.getAll();
    expect(positions.length).toBe(0);
  });
});
