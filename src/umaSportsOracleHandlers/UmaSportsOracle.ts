import { UmaSportsOracle, Game } from "generated";
import type { handlerContext, Market } from "generated";

// Helper: fetch existing game, log and return null if missing.
async function getAndSetGame(
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

UmaSportsOracle.GameCreated.handler(async ({ event, context }) => {
  const { gameId, ancillaryData, ordering } = event.params;
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
});

UmaSportsOracle.GameSettled.handler(async ({ event, context }) => {
  const { away, gameId, home } = event.params;
  await getAndSetGame(
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
  await getAndSetGame(
    gameId,
    context,
    (g) => ({ ...g, state: "Canceled" }),
    `GameCanceled event received, but game ${gameId} does not exist. Skipping.`
  );
});

UmaSportsOracle.GamePaused.handler(async ({ event, context }) => {
  const { gameId } = event.params;
  await getAndSetGame(
    gameId,
    context,
    (g) => ({ ...g, state: "Paused" }),
    `GamePaused event received, but game ${gameId} does not exist. Skipping.`
  );
});

UmaSportsOracle.GameEmergencySettled.handler(async ({ event, context }) => {
  const { away, gameId, home } = event.params;
  await getAndSetGame(
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
  await getAndSetGame(
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

async function getAndSetMarket(
  marketId: string,
  context: handlerContext,
  mutate: (m: Market) => Market | Promise<Market>,
  missingMessage: string
) {
  const existing = await context.Market.get(marketId);
  if (!existing) {
    context.log.error(missingMessage);
    return;
  }
  const updated = await mutate(existing);
  context.Market.set(updated);
}

UmaSportsOracle.MarketResolved.handler(async ({ event, context }) => {
  const { marketId, payouts } = event.params;

  await getAndSetMarket(
    marketId,
    context,
    (m) => ({
      ...m,
      state: "Resolved",
      payouts: payouts.map((p) => BigInt(p)),
    }),
    `MarketResolved event received, but market ${marketId} does not exist. Skipping.`
  );
});
UmaSportsOracle.MarketEmergencyResolved.handler(async ({ event, context }) => {
  const { marketId, payouts } = event.params;
  await getAndSetMarket(
    marketId,
    context,
    (m) => ({
      ...m,
      state: "EmergencyResolved",
      payouts: payouts.map((p) => BigInt(p)),
    }),
    `MarketEmergencyResolved event received, but market ${marketId} does not exist. Skipping.`
  );
});
UmaSportsOracle.MarketPaused.handler(async ({ event, context }) => {
  const { marketId } = event.params;
  await getAndSetMarket(
    marketId,
    context,
    (m) => ({ ...m, state: "Paused" }),
    `MarketPaused event received, but market ${marketId} does not exist. Skipping.`
  );
});
UmaSportsOracle.MarketUnpaused.handler(async ({ event, context }) => {
  const { marketId } = event.params;
  await getAndSetMarket(
    marketId,
    context,
    (m) => ({ ...m, state: "Created" }),
    `MarketUnpaused event received, but market ${marketId} does not exist. Skipping.`
  );
});
