import { BigDecimal, FixedProductMarketMaker } from "generated";

import { increment, max } from "./utils/maths";
import {
  updateFeeFields,
  updateLiquidityFields,
  updateVolumes,
} from "./utils/updateFields";
import { getEventId } from "./utils/getEventId";
import { getCollateralScale } from "./utils/collateralToken";
import { calculatePrices } from "./utils/calculatePrices";
import { nthRoot } from "./utils/nthRoot";
import type { FpmmFundingAddition_t } from "generated/src/db/Entities.gen";

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
    id: getEventId(event.transaction.hash, event.logIndex),
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

FixedProductMarketMaker.FPMMSell.handler(async ({ event, context }) => {
  let fpmmAddress = event.srcAddress;
  let fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
  if (!fpmm) {
    context.log.error(
      `cannot sell: FixedProductMarketMaker instance for ${fpmmAddress} not found`
    );
    return;
  }

  let oldAmounts = fpmm.outcomeTokenAmounts;
  let returnAmountPlusFees = event.params.returnAmount + event.params.feeAmount;

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
        ? old - returnAmountPlusFees + event.params.outcomeTokensSold
        : old - returnAmountPlusFees;

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
    event.params.returnAmount,
    collateralScaleDec,
    "Sell"
  );

  fpmm = updateFeeFields(fpmm, event.params.feeAmount, collateralScaleDec);

  fpmm = {
    ...fpmm,
    tradesQuantity: increment(fpmm.tradesQuantity),
    sellsQuantity: increment(fpmm.sellsQuantity),
  };

  context.FixedProductMarketMaker.set(fpmm);

  // record sell transaction
  context.FpmmTransaction.set({
    id: getEventId(event.transaction.hash, event.logIndex),
    type: "Sell",
    timestamp: event.block.timestamp,
    market_id: event.srcAddress,
    user: event.params.seller,
    tradeAmount: event.params.returnAmount,
    feeAmount: event.params.feeAmount,
    outcomeIndex: BigInt(outcomeIndex),
    outcomeTokensAmount: event.params.outcomeTokensSold,
  });
});

FixedProductMarketMaker.FPMMFundingRemoved.handler(
  async ({ event, context }) => {
    let fpmmAddress = event.srcAddress;
    let fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
    if (!fpmm) {
      context.log.error(
        `cannot remove funding: FixedProductMarketMaker instance for ${fpmmAddress} not found`
      );
      return;
    }

    let oldAmounts = fpmm.outcomeTokenAmounts;
    let amountsRemoved = event.params.amountsRemoved;
    let newAmounts = new Array<bigint>(oldAmounts.length);
    let amountsProduct = BigInt(1);

    for (let i = 0; i < oldAmounts.length; i++) {
      const old = oldAmounts[i];
      const oldAmountsRemoved = amountsRemoved[i];
      if (old === undefined || oldAmountsRemoved === undefined) {
        // skip missing entries (or handle as needed)
        continue;
      }
      const value: bigint = old - oldAmountsRemoved;

      newAmounts[i] = value;
      amountsProduct *= value;
    }

    fpmm = {
      ...fpmm,
      outcomeTokenAmounts: newAmounts,
      outcomeTokenPrices: calculatePrices(newAmounts),
    };

    let liquidityParameter = nthRoot(
      amountsProduct,
      oldAmounts.length,
      context
    );
    let collateralScale = getCollateralScale(fpmm.collateralToken_id, context);
    let collateralScaleDec = BigDecimal(collateralScale.toString());

    fpmm = updateLiquidityFields(fpmm, liquidityParameter, collateralScaleDec);

    fpmm = {
      ...fpmm,
      totalSupply: fpmm.totalSupply - event.params.sharesBurnt,
    };

    if (fpmm.totalSupply === BigInt(0)) {
      fpmm = {
        ...fpmm,
        outcomeTokenPrices: calculatePrices(newAmounts),
      };
    }

    fpmm = {
      ...fpmm,
      liquidityRemoveQuantity: increment(fpmm.liquidityRemoveQuantity),
    };

    context.FixedProductMarketMaker.set(fpmm);

    // record funding removed transaction
    context.FpmmFundingRemoval.set({
      id: event.transaction.hash,
      timestamp: event.block.timestamp,
      fpmm_id: event.srcAddress,
      funder: event.params.funder,
      amountsRemoved: event.params.amountsRemoved,
      collateralRemoved: event.params.collateralRemovedFromFeePool,
      sharesBurnt: event.params.sharesBurnt,
    });
  }
);

FixedProductMarketMaker.FPMMFundingAdded.handler(async ({ event, context }) => {
  let fpmmAddress = event.srcAddress;
  let fpmm = await context.FixedProductMarketMaker.get(fpmmAddress);
  if (!fpmm) {
    context.log.error(
      `cannot add funding: FixedProductMarketMaker instance for ${fpmmAddress} not found`
    );
    return;
  }

  let oldAmounts = fpmm.outcomeTokenAmounts;
  let amountsAdded = event.params.amountsAdded;
  let newAmounts = new Array<bigint>(oldAmounts.length);
  let amountsProduct = BigInt(1);

  for (let i = 0; i < oldAmounts.length; i++) {
    const old = oldAmounts[i];
    const oldAmountsAdded = amountsAdded[i];
    if (old === undefined || oldAmountsAdded === undefined) {
      // skip missing entries (or handle as needed)
      continue;
    }
    const value: bigint = old + oldAmountsAdded;

    newAmounts[i] = value;
    amountsProduct *= value;
  }

  fpmm = {
    ...fpmm,
    outcomeTokenAmounts: newAmounts,
  };

  let liquidityParameter = nthRoot(amountsProduct, oldAmounts.length, context);
  let collateralScale = getCollateralScale(fpmm.collateralToken_id, context);
  let collateralScaleDec = BigDecimal(collateralScale.toString());
  fpmm = updateLiquidityFields(fpmm, liquidityParameter, collateralScaleDec);

  fpmm = {
    ...fpmm,
    totalSupply: fpmm.totalSupply + event.params.sharesMinted,
  };

  if (fpmm.totalSupply === event.params.sharesMinted) {
    fpmm = {
      ...fpmm,
      outcomeTokenPrices: calculatePrices(newAmounts),
    };
  }

  fpmm = {
    ...fpmm,
    liquidityAddQuantity: increment(fpmm.liquidityAddQuantity),
  };

  context.FixedProductMarketMaker.set(fpmm);

  // record funding added transaction
  let fundingAdditionEntity: FpmmFundingAddition_t = {
    id: event.transaction.hash,
    timestamp: event.block.timestamp,
    fpmm_id: event.srcAddress,
    funder: event.params.funder,
    amountsAdded: event.params.amountsAdded,
    amountsRefunded: [0n],
    sharesMinted: event.params.sharesMinted,
  };

  let amountsAddedArr = event.params.amountsAdded;
  let addedFunds = max(amountsAddedArr);
  let amountsRefunded = new Array<bigint>(amountsAddedArr.length);
  for (let i = 0; i < amountsAddedArr.length; i++) {
    let x = amountsAddedArr[i];
    if (x === undefined) {
      continue;
    }
    amountsRefunded[i] = addedFunds - x;
  }

  context.FpmmFundingAddition.set({
    ...fundingAdditionEntity,
    amountsRefunded: amountsRefunded,
  });
});
