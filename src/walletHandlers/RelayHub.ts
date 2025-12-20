import { RelayHub, Wallet } from "generated";
import {
  PROXY_WALLET_FACTORY,
  PROXY_WALLET_IMPLEMENTATION,
} from "./common/constants";
import { computeProxyWalletAddress } from "./common/utils/computeProxyWalletAddress";

RelayHub.TransactionRelayed.handler(async ({ event, context }) => {
  if (event.params.to == PROXY_WALLET_FACTORY.toLowerCase()) {
    return;
  }

  const walletAddress = computeProxyWalletAddress(
    event.params.from as `0x${string}`,
    PROXY_WALLET_FACTORY,
    PROXY_WALLET_IMPLEMENTATION
  );

  const wallet = await context.Wallet.get(walletAddress);

  if (!wallet) {
    // this will save us few DB writes
    const newWallet: Wallet = {
      id: walletAddress,
      signer: event.params.from,
      walletType: "PROXY",
      balance: BigInt(0),
      lastTransfer: 0,
      createdAt: event.block.timestamp,
    };
    context.Wallet.set(newWallet);
  }
});
