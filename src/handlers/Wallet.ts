import { indexer } from "envio";
import {
  PROXY_WALLET_FACTORY,
  PROXY_WALLET_IMPLEMENTATION,
} from "../utils/constants.js";
import { computeProxyWalletAddress } from "../utils/wallet.js";

// Wallet registry only: maps proxy wallets to their owner EOAs. USDC.e
// balance tracking (the official wallet subgraph's other half) was dropped
// with the pUSD transition — it required indexing every USDC.e transfer on
// Polygon; live balances are tracked in V2PolyUSDAccount from pUSD events.

// ============================================================
// RelayHub — proxy wallet creation
// ============================================================

indexer.onEvent(
  { contract: "RelayHub", event: "TransactionRelayed" },
  async ({ event, context }) => {
  const from = event.params.from;
  const to = event.params.to;

  // Only process calls to the proxy wallet factory
  if (to.toLowerCase() !== PROXY_WALLET_FACTORY.toLowerCase()) {
    return;
  }

  const walletAddress = computeProxyWalletAddress(
    from as `0x${string}`,
    PROXY_WALLET_FACTORY as `0x${string}`,
    PROXY_WALLET_IMPLEMENTATION as `0x${string}`,
  );

  const existing = await context.Wallet.get(walletAddress);
  if (!existing) {
    context.Wallet.set({
      id: walletAddress,
      signer: from,
      type: "proxy",
      createdAt: BigInt(event.block.timestamp),
    });
  }
  },
);

// ============================================================
// SafeProxyFactory — safe wallet creation
// ============================================================

indexer.onEvent(
  { contract: "SafeProxyFactory", event: "ProxyCreation" },
  async ({ event, context }) => {
  const proxyAddress = event.params.proxy;

  const existing = await context.Wallet.get(proxyAddress);
  if (!existing) {
    context.Wallet.set({
      id: proxyAddress,
      signer: event.params.owner,
      type: "safe",
      createdAt: BigInt(event.block.timestamp),
    });
  }
  },
);
