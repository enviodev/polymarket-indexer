import { indexer } from "envio";
import { NEG_RISK_FEE_MODULE } from "../utils/constants.js";

indexer.onEvent(
  { contract: "FeeModule", event: "FeeRefunded" },
  async ({ event, context }) => {
    const negRisk =
      event.srcAddress.toLowerCase() === NEG_RISK_FEE_MODULE.toLowerCase();

    context.FeeRefunded.set({
      id: `${event.chainId}_${event.block.number}_${event.logIndex}`,
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
