import { UmaSportsOracle, Game } from "generated";
import type { handlerContext, Market } from "generated";

// Helper: fetch existing game, log and return null if missing.
async function getAndSet(
  gameId: string,
  context: handlerContext,
  mutate: (g: Game) => Game | Promise<Game>,
  missingMessage: string
) {
  const existing = await context.Game.get(gameId);
  if (!existing) {
    context.log.error(missingMessage);
    return;
  }
  const updated = await mutate(existing);
  context.Game.set(updated);
}

// Helper for creating a game if it doesn't already exist.
async function createGame(
  gameId: string,
  ancillaryData: string,
  ordering: number | string,
  context: handlerContext
) {
  const existing = await context.Game.get(gameId);
  if (existing) {
    context.log.warn(
      `GameCreated event received, but game ${gameId} already exists. Skipping.`
    );
    return;
  }

  const game: Game = {
    id: gameId,
    ancillaryData,
    ordering: Number(ordering) === 0 ? "Home" : "Away",
    state: "Created",
    homeScore: 0n,
    awayScore: 0n,
  };

  context.Game.set(game);
}

UmaSportsOracle.GameCreated.handler(async ({ event, context }) => {
  const { gameId, ancillaryData, ordering } = event.params;
  await createGame(gameId, ancillaryData, Number(ordering), context);
});

UmaSportsOracle.GameSettled.handler(async ({ event, context }) => {
  const { away, gameId, home } = event.params;
  await getAndSet(
    gameId,
    context,
    (g) => ({
      ...g,
      state: "Settled",
      homeScore: BigInt(home),
      awayScore: BigInt(away),
    }),
    `GameSettled event received, but game ${gameId} does not exist. Skipping.`
  );
});

UmaSportsOracle.GameCanceled.handler(async ({ event, context }) => {
  const { gameId } = event.params;
  await getAndSet(
    gameId,
    context,
    (g) => ({ ...g, state: "Canceled" }),
    `GameCanceled event received, but game ${gameId} does not exist. Skipping.`
  );
});

UmaSportsOracle.GamePaused.handler(async ({ event, context }) => {
  const { gameId } = event.params;
  await getAndSet(
    gameId,
    context,
    (g) => ({ ...g, state: "Paused" }),
    `GamePaused event received, but game ${gameId} does not exist. Skipping.`
  );
});

UmaSportsOracle.GameEmergencySettled.handler(async ({ event, context }) => {
  const { away, gameId, home } = event.params;
  await getAndSet(
    gameId,
    context,
    (g) => ({
      ...g,
      state: "EmergencySettled",
      homeScore: BigInt(home),
      awayScore: BigInt(away),
    }),
    `GameEmergencySettled event received, but game ${gameId} does not exist. Skipping.`
  );
});

UmaSportsOracle.GameUnpaused.handler(async ({ event, context }) => {
  const { gameId } = event.params;
  await getAndSet(
    gameId,
    context,
    (g) => ({ ...g, state: "Created" }),
    `GameUnpaused event received, but game ${gameId} does not exist. Skipping.`
  );
});

// Market Related Handlers
function getMarketType(marketTypeId: number): string {
  if (marketTypeId === 0) {
    return "moneyline";
  } else if (marketTypeId === 1) {
    return "spreads";
  } else {
    return "totals";
  }
}

UmaSportsOracle.MarketCreated.handler(async ({ event, context }) => {
  const { gameId, marketId, marketType, underdog, line } = event.params;

  const market = await context.Market.get(marketId);
  if (market) {
    context.log.warn(
      `MarketCreated event received, but market ${marketId} already exists. Skipping.`
    );
    return;
  }
  const newMarket: Market = {
    id: marketId,
    gameId: gameId,
    state: "Created",
    marketType: getMarketType(Number(marketType)),
    underdog: Number(underdog) == 0 ? "Home" : "Away",
    line: BigInt(line),
    payouts: [],
  };
  context.Market.set(newMarket);
});
