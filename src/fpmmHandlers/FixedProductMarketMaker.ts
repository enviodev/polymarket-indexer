import { time } from "console";
import {
  BigDecimal,
  FixedProductMarketMaker,
  TradeType,
  type HandlerContext,
} from "generated";

import type { FixedProductMarketMaker_t } from "generated/src/db/Entities.gen";

function getEventKey(hash: string, logIndex: number) {
  return `${hash}_${logIndex}`;
}

FixedProductMarketMaker.FPMMBuy.handler(async ({ event, context }) => {
  let fpmmAddress = event.srcAddress;
  let fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
  if (!fpmm) {
    context.log.error(
      `cannot buy: FixedProductMarketMaker instance for ${fpmmAddress} not found`
    );
    return;
  }

  let oldAmounts = fpmm.outcomeTokenAmounts;
  let investmentAmountMinusFees =
    event.params.investmentAmount - event.params.feeAmount;
  let outcomeIndex = Number(event.params.outcomeIndex);

  let newAmounts = new Array<bigint>(oldAmounts.length);
  let amountsProduct = BigInt(1);

  for (let i = 0; i < oldAmounts.length; i++) {
    const old = oldAmounts[i];
    if (old === undefined) {
      // skip missing entries (or handle as needed)
      continue;
    }
    const value: bigint =
      i === outcomeIndex
        ? old + investmentAmountMinusFees - event.params.outcomeTokensBought
        : old + investmentAmountMinusFees;

    newAmounts[i] = value;
    amountsProduct *= value;
  }

  fpmm = {
    ...fpmm,
    outcomeTokenAmounts: newAmounts,
    outcomeTokenPrices: calculatePrices(newAmounts),
  };

  let liquidityParameter = nthRoot(amountsProduct, oldAmounts.length, context);
  let collateralScale = getCollateralScale(fpmm.collateralToken_id, context);
  let collateralScaleDec = BigDecimal(collateralScale.toString());

  fpmm = updateLiquidityFields(fpmm, liquidityParameter, collateralScaleDec);

  fpmm = updateVolumes(
    fpmm,
    event.block.timestamp,
    event.params.investmentAmount,
    collateralScaleDec,
    "Buy"
  );

  fpmm = updateFeeFields(fpmm, event.params.feeAmount, collateralScaleDec);

  fpmm = {
    ...fpmm,
    tradesQuantity: increment(fpmm.tradesQuantity),
    buysQuantity: increment(fpmm.buysQuantity),
  };

  context.FixedProductMarketMaker.set(fpmm);

  // record buy transaction
  context.FpmmTransaction.set({
    id: getEventKey(event.transaction.hash, event.logIndex),
    type: "Buy",
    timestamp: event.block.timestamp,
    market_id: event.srcAddress,
    user: event.params.buyer,
    tradeAmount: event.params.investmentAmount,
    feeAmount: event.params.feeAmount,
    outcomeIndex: BigInt(outcomeIndex),
    outcomeTokensAmount: event.params.outcomeTokensBought,
  });
});

function calculatePrices(amounts: bigint[]): BigDecimal[] {
  let outcomePrices = new Array<BigDecimal>(amounts.length);
  outcomePrices = outcomePrices.fill(BigDecimal(0));

  let totalTokensBalance = BigInt(0);
  let product = BigInt(1);

  for (let i = 0; i < amounts.length; i++) {
    let amount = amounts[i];
    if (amount === undefined) {
      continue;
    }
    totalTokensBalance += amount;
    product *= amount;
  }

  if (totalTokensBalance > BigInt(0)) {
    return outcomePrices;
  }

  let denominator = BigInt(0);
  for (let i = 0; i < amounts.length; i++) {
    let amount = amounts[i];
    if (amount === undefined) {
      continue;
    }
    denominator = denominator + product / amount;
  }

  for (let i = 0; i < amounts.length; i++) {
    let amount = amounts[i];
    if (amount === undefined) {
      continue;
    }
    let price: BigDecimal = BigDecimal(product.toString()).div(
      BigDecimal((amount * denominator).toString())
    );
    outcomePrices[i] = price;
  }

  return outcomePrices;
}

function nthRoot(x: bigint, n: number, context: HandlerContext): bigint {
  if (n <= 0) {
    context.log.error(`invalid n ${n} passed to nthRoot`);
  }

  if (x == 0n) {
    return 0n;
  }

  let nAsBigInt = BigInt(n);

  let root = x;
  let deltaRoot: bigint;

  do {
    let rootPowNLess1 = 1n;
    for (let i = 1; i < n - 1; i++) {
      rootPowNLess1 *= root;
    }

    deltaRoot = (x / rootPowNLess1 - root) / nAsBigInt;
    root += deltaRoot;
  } while (deltaRoot < 0n);

  return root;
}

function getCollateralScale(
  collateralTokenId: string,
  context: HandlerContext
): BigInt {
  // TODO: fetch collateral token decimals from CollateralToken entity
  return BigInt(10 ** 18);
}

function updateLiquidityFields(
  fpmm: FixedProductMarketMaker_t,
  liquidityParameter: bigint,
  collateralScale: BigDecimal
): FixedProductMarketMaker_t {
  return {
    ...fpmm,
    liquidityParameter: liquidityParameter,
    scaledLiquidityParameter: BigDecimal(liquidityParameter.toString()).div(
      collateralScale
    ),
  };
}

function timestampToDay(timestamp: number): number {
  return Math.floor(timestamp / 86400);
}

function updateVolumes(
  fpmm: FixedProductMarketMaker_t,
  timestamp: number,
  tradeSize: bigint,
  collateralScale: BigDecimal,
  tradeType: TradeType
): FixedProductMarketMaker_t {
  fpmm = {
    ...fpmm,
    lastActiveDay:
      fpmm.lastActiveDay !== timestampToDay(timestamp)
        ? timestampToDay(timestamp)
        : fpmm.lastActiveDay,
  };

  let newTradeSize = fpmm.collateralVolume + tradeSize;
  let newTradeSizeScaled = BigDecimal(newTradeSize.toString()).div(
    collateralScale
  );

  fpmm = {
    ...fpmm,
    collateralVolume: newTradeSize,
    scaledCollateralVolume: newTradeSizeScaled,
  };

  if (tradeType === "Buy") {
    let newBuySize = fpmm.collateralBuyVolume + tradeSize;
    let newBuySizeScaled = BigDecimal(newBuySize.toString()).div(
      collateralScale
    );
    fpmm = {
      ...fpmm,
      collateralBuyVolume: newBuySize,
      scaledCollateralBuyVolume: newBuySizeScaled,
    };
  } else if (tradeType === "Sell") {
    let newSellSize = fpmm.collateralSellVolume + tradeSize;
    let newSellSizeScaled = BigDecimal(newSellSize.toString()).div(
      collateralScale
    );
    fpmm = {
      ...fpmm,
      collateralSellVolume: newSellSize,
      scaledCollateralSellVolume: newSellSizeScaled,
    };
  }

  return fpmm;
}

function updateFeeFields(
  fpmm: FixedProductMarketMaker_t,
  feeAmount: bigint,
  collateralScale: BigDecimal
): FixedProductMarketMaker_t {
  const newFeeVolume = fpmm.feeVolume + feeAmount;

  return {
    ...fpmm,
    feeVolume: newFeeVolume,
    scaledFeeVolume: BigDecimal(newFeeVolume.toString()).div(collateralScale),
  };
}

function increment(x: bigint): bigint {
  return x + 1n;
}
