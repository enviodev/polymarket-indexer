import { indexer } from "envio";
import { getEventKey } from "../utils/negRisk.js";
import { NEG_RISK_FEE_MODULE } from "../utils/constants.js";

indexer.onEvent(
  { contract: "FeeModule", event: "FeeRefunded" },
  async ({ event, context }) => {
    const negRisk =
      event.srcAddress.toLowerCase() === NEG_RISK_FEE_MODULE.toLowerCase();

    context.FeeRefunded.set({
      id: getEventKey(event.block.number, event.logIndex),
      orderHash: event.params.orderHash,
      tokenId: event.params.id.toString(),
      timestamp: event.block.timestamp,
      refundee: event.params.to,
      feeRefunded: event.params.refund,
      feeCharged: event.params.feeCharged,
      negRisk,
    });
  },
);
