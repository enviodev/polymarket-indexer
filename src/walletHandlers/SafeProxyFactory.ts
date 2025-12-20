import { SafeProxyFactory, Wallet } from "generated";

SafeProxyFactory.ProxyCreation.handler(async ({ event, context }) => {
  const wallet = await context.Wallet.get(event.params.proxy);

  if (!wallet) {
    // this will save us few DB writes
    const newWallet: Wallet = {
      id: event.params.proxy,
      signer: event.params.owner,
      walletType: "Safe",
      balance: BigInt(0),
      lastTransfer: 0,
      createdAt: event.block.timestamp,
    };
    context.Wallet.set(newWallet);
  }
});
