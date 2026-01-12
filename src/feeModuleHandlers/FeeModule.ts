import { indexer } from "generated";
import { FeeModule } from "generated";
import { getEventId } from "../common/utils/getEventId";

FeeModule.FeeRefunded.handler(async ({ event, context }) => {
  const { id, to, orderHash, refund, feeCharged } = event.params;

  let negRisk = false;
  if (event.srcAddress == indexer.chains[137].FeeModule.addresses[1]) {
    negRisk = true;
  }

  context.FeeRefundedEntity.set({
    id: getEventId(event.transaction.hash, event.logIndex),
    tokenId: id.toString(),
    refundee: to,
    orderHash: orderHash,
    timestamp: event.block.timestamp,
    feeRefunded: refund,
    feeCharged: feeCharged,
    negRisk: negRisk,
  });
});
