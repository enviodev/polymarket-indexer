import { indexer } from "envio";

// State constants
const GameStateCreated = "Created";
const GameStateSettled = "Settled";
const GameStateCanceled = "Canceled";
const GameStatePaused = "Paused";
const GameStateEmergencySettled = "EmergencySettled";

const MarketStateCreated = "Created";
const MarketStateResolved = "Resolved";
const MarketStatePaused = "Paused";
const MarketStateEmergencyResolved = "EmergencyResolved";

// Enum mappers
function getMarketType(marketTypeEnum: bigint): string {
  if (marketTypeEnum === 0n) return "moneyline";
  if (marketTypeEnum === 1n) return "spreads";
  return "totals";
}

function getGameOrdering(gameOrderingEnum: bigint): string {
  return gameOrderingEnum === 0n ? "home" : "away";
}

function getMarketUnderdog(underdogEnum: bigint): string {
  return underdogEnum === 0n ? "home" : "away";
}

// ============================================================
// Game event handlers
// ============================================================

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "GameCreated" },
  async ({ event, context }) => {
    const gameId = event.params.gameId.toLowerCase();
    context.Game.set({
      id: gameId,
      ancillaryData: event.params.ancillaryData,
      ordering: getGameOrdering(event.params.ordering),
      state: GameStateCreated,
      homeScore: 0n,
      awayScore: 0n,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "GameSettled" },
  async ({ event, context }) => {
    const gameId = event.params.gameId.toLowerCase();
    const game = await context.Game.get(gameId);
    if (!game) {
      context.log.error(`Game not found: ${gameId}`);
      return;
    }
    context.Game.set({
      ...game,
      state: GameStateSettled,
      homeScore: event.params.home,
      awayScore: event.params.away,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "GameEmergencySettled" },
  async ({ event, context }) => {
    const gameId = event.params.gameId.toLowerCase();
    const game = await context.Game.get(gameId);
    if (!game) {
      context.log.error(`Game not found: ${gameId}`);
      return;
    }
    context.Game.set({
      ...game,
      state: GameStateEmergencySettled,
      homeScore: event.params.home,
      awayScore: event.params.away,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "GameCanceled" },
  async ({ event, context }) => {
    const gameId = event.params.gameId.toLowerCase();
    const game = await context.Game.get(gameId);
    if (!game) {
      context.log.error(`Game not found: ${gameId}`);
      return;
    }
    context.Game.set({
      ...game,
      state: GameStateCanceled,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "GamePaused" },
  async ({ event, context }) => {
    const gameId = event.params.gameId.toLowerCase();
    const game = await context.Game.get(gameId);
    if (!game) {
      context.log.error(`Game not found: ${gameId}`);
      return;
    }
    context.Game.set({
      ...game,
      state: GameStatePaused,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "GameUnpaused" },
  async ({ event, context }) => {
    const gameId = event.params.gameId.toLowerCase();
    const game = await context.Game.get(gameId);
    if (!game) {
      context.log.error(`Game not found: ${gameId}`);
      return;
    }
    context.Game.set({
      ...game,
      state: GameStateCreated, // Unpaused reverts to Created state
    });
  },
);

// ============================================================
// Market event handlers
// ============================================================

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "MarketCreated" },
  async ({ event, context }) => {
    const marketId = event.params.marketId.toLowerCase();
    context.Market.set({
      id: marketId,
      gameId: event.params.gameId.toLowerCase(),
      state: MarketStateCreated,
      marketType: getMarketType(event.params.marketType),
      underdog: getMarketUnderdog(event.params.underdog),
      line: event.params.line,
      payouts: [],
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "MarketResolved" },
  async ({ event, context }) => {
    const marketId = event.params.marketId.toLowerCase();
    const market = await context.Market.get(marketId);
    if (!market) {
      context.log.error(`Market not found: ${marketId}`);
      return;
    }
    context.Market.set({
      ...market,
      state: MarketStateResolved,
      payouts: event.params.payouts,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "MarketEmergencyResolved" },
  async ({ event, context }) => {
    const marketId = event.params.marketId.toLowerCase();
    const market = await context.Market.get(marketId);
    if (!market) {
      context.log.error(`Market not found: ${marketId}`);
      return;
    }
    context.Market.set({
      ...market,
      state: MarketStateEmergencyResolved,
      payouts: event.params.payouts,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "MarketPaused" },
  async ({ event, context }) => {
    const marketId = event.params.marketId.toLowerCase();
    const market = await context.Market.get(marketId);
    if (!market) {
      context.log.error(`Market not found: ${marketId}`);
      return;
    }
    context.Market.set({
      ...market,
      state: MarketStatePaused,
    });
  },
);

indexer.onEvent(
  { contract: "UmaSportsOracle", event: "MarketUnpaused" },
  async ({ event, context }) => {
    const marketId = event.params.marketId.toLowerCase();
    const market = await context.Market.get(marketId);
    if (!market) {
      context.log.error(`Market not found: ${marketId}`);
      return;
    }
    context.Market.set({
      ...market,
      state: MarketStateCreated, // Unpaused reverts to Created state
    });
  },
);
