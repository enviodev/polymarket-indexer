import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../../handlers/v2/CtfCollateralAdapter.js";

const STANDARD_ADAPTER = "0xada100874d00e3331d00f2007a9c336a65009718";
const NEG_RISK_ADAPTER = "0xada200001000ef00d07553cee7006808f895c6f1";
const STAKEHOLDER = "0x1111111111111111111111111111111111111111";
const PUSD = "0xc011a7e12a19f7b1f670d46f03b03f3342e82dfb";
const PARENT_COLLECTION =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";

describe("CtfCollateralAdapter.PositionSplit", () => {
  it("creates a V2CtfSplit with isNegRisk=false for the standard adapter", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CtfCollateralAdapter",
              srcAddress: STANDARD_ADAPTER,
              event: "PositionSplit",
              params: {
                stakeholder: STAKEHOLDER,
                collateralToken: PUSD,
                parentCollectionId: PARENT_COLLECTION,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 1_000_000n,
              },
            },
          ],
        },
      },
    });

    const splits = await indexer.V2CtfSplit.getAll();
    expect(splits.length).toBe(1);
    expect(splits[0]!.stakeholder.toLowerCase()).toBe(STAKEHOLDER);
    expect(splits[0]!.amount).toBe(1_000_000n);
    expect(splits[0]!.isNegRisk).toBe(false);

    const stats = await indexer.V2CtfAdapterStats.getAll();
    expect(stats[0]!.totalSplits).toBe(1n);
    expect(stats[0]!.totalSplitVolume).toBe(1_000_000n);
  });

  it("marks isNegRisk=true for the neg-risk adapter", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CtfCollateralAdapter",
              srcAddress: NEG_RISK_ADAPTER,
              event: "PositionSplit",
              params: {
                stakeholder: STAKEHOLDER,
                collateralToken: PUSD,
                parentCollectionId: PARENT_COLLECTION,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 500_000n,
              },
            },
          ],
        },
      },
    });

    const splits = await indexer.V2CtfSplit.getAll();
    expect(splits[0]!.isNegRisk).toBe(true);
  });
});

describe("CtfCollateralAdapter.PositionsMerge + PayoutRedemption", () => {
  it("tracks merges", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CtfCollateralAdapter",
              srcAddress: STANDARD_ADAPTER,
              event: "PositionsMerge",
              params: {
                stakeholder: STAKEHOLDER,
                collateralToken: PUSD,
                parentCollectionId: PARENT_COLLECTION,
                conditionId: CONDITION_ID,
                partition: [1n, 2n],
                amount: 750_000n,
              },
            },
          ],
        },
      },
    });

    const merges = await indexer.V2CtfMerge.getAll();
    expect(merges.length).toBe(1);
    expect(merges[0]!.amount).toBe(750_000n);

    const stats = await indexer.V2CtfAdapterStats.getAll();
    expect(stats[0]!.totalMerges).toBe(1n);
  });

  it("tracks redemptions", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "CtfCollateralAdapter",
              srcAddress: STANDARD_ADAPTER,
              event: "PayoutRedemption",
              params: {
                redeemer: STAKEHOLDER,
                collateralToken: PUSD,
                parentCollectionId: PARENT_COLLECTION,
                conditionId: CONDITION_ID,
                indexSets: [1n],
                payout: 2_000_000n,
              },
            },
          ],
        },
      },
    });

    const redemptions = await indexer.V2CtfRedemption.getAll();
    expect(redemptions.length).toBe(1);
    expect(redemptions[0]!.payout).toBe(2_000_000n);

    const stats = await indexer.V2CtfAdapterStats.getAll();
    expect(stats[0]!.totalRedemptionPayout).toBe(2_000_000n);
  });
});

describe("NegRiskCtfCollateralAdapter Wrapped/Unwrapped", () => {
  it("routes neg-risk CTF wraps into V2PolyUSDWrap with eventType=wrap_negrisk_ctf", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "NegRiskCtfCollateralAdapter",
              event: "Wrapped",
              params: {
                caller: STAKEHOLDER,
                asset: PUSD,
                to: STAKEHOLDER,
                amount: 1_000_000n,
              },
            },
          ],
        },
      },
    });

    const wraps = await indexer.V2PolyUSDWrap.getAll();
    expect(wraps.length).toBe(1);
    expect(wraps[0]!.eventType).toBe("wrap_negrisk_ctf");
    expect(wraps[0]!.amount).toBe(1_000_000n);
  });
});
