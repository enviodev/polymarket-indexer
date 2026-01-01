import type { HandlerContext } from "generated";
import { GLOBAL_OPEN_INTEREST_ID } from "./constants";

async function updateMarketOpenInterest(
  amount: bigint,
  conditionId: string,
  context: HandlerContext
) {
  let marketOpenInterest = await context.MarketOpenInterest.getOrCreate({
    id: conditionId,
    amount: 0n,
  });

  marketOpenInterest = {
    ...marketOpenInterest,
    amount: marketOpenInterest.amount + amount,
  };

  context.MarketOpenInterest.set(marketOpenInterest);
}

async function updateGlobalOpenInterest(
  amount: bigint,
  context: HandlerContext
) {
  let globalOpenInterest = await context.GlobalOpenInterest.getOrCreate({
    id: GLOBAL_OPEN_INTEREST_ID,
    amount: 0n,
  });

  globalOpenInterest = {
    ...globalOpenInterest,
    amount: globalOpenInterest.amount + amount,
  };

  context.GlobalOpenInterest.set(globalOpenInterest);
}

export async function updateOpenInterest(
  amount: bigint,
  conditionId: string,
  context: HandlerContext
) {
  await Promise.all([
    updateGlobalOpenInterest(amount, context),
    updateMarketOpenInterest(amount, conditionId, context),
  ]);
}
