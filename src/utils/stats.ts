// Per-user and per-builder rollups, updated on the fill hot path. Both live
// in Postgres only: they're read-modify-write on every fill, which would
// version-explode ClickHouse's insert-only history tables.

async function loadOrCreateUserStats(
  context: any,
  user: string,
): Promise<{
  id: string;
  realizedPnl: bigint;
  volume: bigint;
  trades: bigint;
  feesPaid: bigint;
  lastTradeTimestamp: number;
}> {
  const existing = await context.UserStats.get(user);
  if (existing) return existing;
  return {
    id: user,
    realizedPnl: 0n,
    volume: 0n,
    trades: 0n,
    feesPaid: 0n,
    lastTradeTimestamp: 0,
  };
}

/**
 * Book one fill (V1/V2 exchange or FPMM trade) for the attributed party.
 * `collateralAmount` is the fill's quote (collateral) amount in 6-decimal
 * units, matching how per-token and global volumes are counted.
 */
export async function recordUserTrade(
  context: any,
  user: string,
  collateralAmount: bigint,
  fee: bigint,
  timestamp: number,
): Promise<void> {
  const stats = await loadOrCreateUserStats(context, user);
  context.UserStats.set({
    ...stats,
    volume: stats.volume + collateralAmount,
    trades: stats.trades + 1n,
    feesPaid: stats.feesPaid + fee,
    lastTradeTimestamp: timestamp,
  });
}

/**
 * Fold a realized-PnL delta into the user's rollup, keeping the invariant
 * UserStats.realizedPnl == sum(UserPosition.realizedPnl) for the user.
 * No-op deltas skip the write — most position changes realize nothing.
 */
export async function recordRealizedPnl(
  context: any,
  user: string,
  delta: bigint,
): Promise<void> {
  if (delta === 0n) return;
  const stats = await loadOrCreateUserStats(context, user);
  context.UserStats.set({
    ...stats,
    realizedPnl: stats.realizedPnl + delta,
  });
}

/** Book a V2 fill against its on-chain builder code (zero code = no builder). */
export async function recordBuilderFill(
  context: any,
  builder: string,
  collateralAmount: bigint,
  fee: bigint,
  timestamp: number,
): Promise<void> {
  const existing = await context.BuilderStats.get(builder);
  const stats = existing ?? {
    id: builder,
    fills: 0n,
    volume: 0n,
    fees: 0n,
    firstSeenAt: timestamp,
    lastSeenAt: timestamp,
  };
  context.BuilderStats.set({
    ...stats,
    fills: stats.fills + 1n,
    volume: stats.volume + collateralAmount,
    fees: stats.fees + fee,
    lastSeenAt: timestamp,
  });
}
