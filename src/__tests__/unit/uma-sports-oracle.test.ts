import { describe, it, expect } from "vitest";
import { createTestIndexer } from "generated";
import "../../handlers/UmaSportsOracle.js";

const GAME_ID =
  "0x1000000000000000000000000000000000000000000000000000000000000001";
const MARKET_ID =
  "0x2000000000000000000000000000000000000000000000000000000000000002";
const CONDITION_ID =
  "0x3000000000000000000000000000000000000000000000000000000000000003";
const UNDERDOG = 1n;

describe("UmaSportsOracle.GameCreated", () => {
  it("creates a Game entity with state=Created", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "UmaSportsOracle",
              event: "GameCreated",
              params: {
                gameId: GAME_ID,
                ordering: 0n,
                ancillaryData: "0xdeadbeef",
                timestamp: 1_700_000_000n,
              },
            },
          ],
        },
      },
    });

    const game = await indexer.Game.get(GAME_ID);
    expect(game).toBeDefined();
    expect(game!.state).toBe("Created");
    expect(game!.homeScore).toBe(0n);
    expect(game!.awayScore).toBe(0n);
  });
});

describe("UmaSportsOracle.GameSettled", () => {
  it("updates an existing Game with scores and state=Settled", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "UmaSportsOracle",
              event: "GameCreated",
              params: {
                gameId: GAME_ID,
                ordering: 0n,
                ancillaryData: "0xdeadbeef",
                timestamp: 1_700_000_000n,
              },
            },
            {
              contract: "UmaSportsOracle",
              event: "GameSettled",
              params: { gameId: GAME_ID, home: 21n, away: 14n },
            },
          ],
        },
      },
    });

    const game = await indexer.Game.get(GAME_ID);
    expect(game!.state).toBe("Settled");
    expect(game!.homeScore).toBe(21n);
    expect(game!.awayScore).toBe(14n);
  });
});

describe("UmaSportsOracle.MarketCreated", () => {
  it("creates a Market entity with state=Created", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "UmaSportsOracle",
              event: "MarketCreated",
              params: {
                marketId: MARKET_ID,
                gameId: GAME_ID,
                conditionId: CONDITION_ID,
                marketType: 0n,
                underdog: UNDERDOG,
                line: 500n,
              },
            },
          ],
        },
      },
    });

    const market = await indexer.Market.get(MARKET_ID);
    expect(market).toBeDefined();
    expect(market!.state).toBe("Created");
    expect(market!.gameId).toBe(GAME_ID);
    expect(market!.line).toBe(500n);
  });
});

describe("UmaSportsOracle.GameCanceled", () => {
  it("sets game state to Canceled", async () => {
    const indexer = createTestIndexer();

    await indexer.process({
      chains: {
        137: {
          simulate: [
            {
              contract: "UmaSportsOracle",
              event: "GameCreated",
              params: {
                gameId: GAME_ID,
                ordering: 0n,
                ancillaryData: "0x",
                timestamp: 1_700_000_000n,
              },
            },
            {
              contract: "UmaSportsOracle",
              event: "GameCanceled",
              params: { gameId: GAME_ID },
            },
          ],
        },
      },
    });

    const game = await indexer.Game.get(GAME_ID);
    expect(game!.state).toBe("Canceled");
  });
});
