# ClickHouse query cookbook

The massive append-only streams (fills, activity, pUSD flows) live only in
ClickHouse — see the Storage section of the README. This file shows how to
query them. Postgres/GraphQL remains the place for entity lookups and the
mutable aggregates (`UserStats`, `BuilderStats`, `UserPosition`, markets, OI).

## Connecting

```bash
clickhouse-client \
  --host "$ENVIO_CLICKHOUSE_HOST" -d "$ENVIO_CLICKHOUSE_DATABASE" \
  --user "$ENVIO_CLICKHOUSE_USERNAME" --password "$ENVIO_CLICKHOUSE_PASSWORD"
```

Each entity has two objects: `envio_history_<Entity>` (the raw MergeTree the
indexer inserts into) and a `<Entity>` view that deduplicates versions. The
stream entities here are insert-once, so query the **history tables
directly** — same rows, no dedup overhead. Amount columns are `Decimal(38,0)`
in 6-decimal collateral units; `timestamp` is unix seconds.

## Candles (OHLCV)

One-time setup (after the indexer's first start):

```bash
clickhouse-client ... --queries-file clickhouse/candles.sql
```

That maintains 1-minute candles per outcome token in `polymarket_candles_1m`,
fed by both the V1 and V2 fill streams. Serve any interval by rolling up:

```sql
-- Hourly candles for one token, last 30 days
SELECT
  toStartOfHour(bucket)            AS t,
  argMinMerge(open)                AS open,
  maxMerge(high)                   AS high,
  minMerge(low)                    AS low,
  argMaxMerge(close)               AS close,
  sumMerge(volume) / 1e6           AS volume_usdc,
  countMerge(trades)               AS trades
FROM polymarket_candles_1m
WHERE tokenId = '{tokenId}' AND bucket >= now() - INTERVAL 30 DAY
GROUP BY t ORDER BY t;
```

Ad hoc (no materialized view needed), e.g. V2-only daily candles:

```sql
SELECT
  toStartOfDay(toDateTime(timestamp))                        AS t,
  argMin(price, timestamp) AS open, max(price) AS high,
  min(price) AS low, argMax(price, timestamp) AS close,
  sum(quote) / 1e6 AS volume_usdc, count() AS trades
FROM (
  SELECT timestamp,
    if(side = 0, makerAmountFilled, takerAmountFilled) AS quote,
    if(side = 0, takerAmountFilled, makerAmountFilled) AS base,
    toFloat64(quote) / toFloat64(base)                 AS price
  FROM envio_history_V2OrderFill
  WHERE tokenId = '{tokenId}'
)
WHERE base > 0
GROUP BY t ORDER BY t;
```

## Market volume

```sql
-- Top tokens by V2 volume, last 7 days
SELECT tokenId,
  sum(if(side = 0, makerAmountFilled, takerAmountFilled)) / 1e6 AS volume_usdc,
  count() AS fills
FROM envio_history_V2OrderFill
WHERE timestamp >= toUnixTimestamp(now() - INTERVAL 7 DAY)
GROUP BY tokenId ORDER BY volume_usdc DESC LIMIT 25;
```

Join token → market via Postgres (`V2Market.id` is the tokenId, `Position` +
`MarketData` cover the V1 era).

## User activity feed

The activity streams sort user-first, so per-address history is one range
read per table:

```sql
SELECT 'split' AS kind, timestamp, condition, amount FROM envio_history_Split
WHERE stakeholder = '{address}'
UNION ALL
SELECT 'merge', timestamp, condition, amount FROM envio_history_Merge
WHERE stakeholder = '{address}'
UNION ALL
SELECT 'redemption', timestamp, condition, payout FROM envio_history_Redemption
WHERE redeemer = '{address}'
ORDER BY timestamp DESC LIMIT 100;
```

Fills for the same feed: `envio_history_OrderFilledEvent WHERE maker =
'{address}'` and `envio_history_V2OrderFill WHERE maker = '{address}'`.

## Builder codes (V2 attribution)

Current totals are one Postgres row each (`BuilderStats`). Time series come
from the fill stream:

```sql
SELECT toStartOfDay(toDateTime(timestamp)) AS day, builder,
  sum(if(side = 0, makerAmountFilled, takerAmountFilled)) / 1e6 AS volume_usdc,
  count() AS fills, sum(fee) / 1e6 AS fees_usdc
FROM envio_history_V2OrderFill
WHERE builder != '0x0000000000000000000000000000000000000000000000000000000000000000'
GROUP BY day, builder ORDER BY day DESC, volume_usdc DESC;
```

## pUSD flows

```sql
-- Daily wrap vs unwrap volume
SELECT toStartOfDay(toDateTime(timestamp)) AS day,
  sumIf(amount, eventType LIKE 'wrap%') / 1e6   AS wrapped_usdc,
  sumIf(amount, eventType LIKE 'unwrap%') / 1e6 AS unwrapped_usdc
FROM envio_history_V2PolyUSDWrap
GROUP BY day ORDER BY day DESC LIMIT 30;
```

## Caveats

- Materialized views see inserts only. Apply `candles.sql` before the sync
  (or run its backfill inserts once after). Reorg rollbacks delete source
  rows without reversing candle aggregates — shallow on Polygon; rebuild a
  monthly partition from the source stream if it ever matters.
- Never point two indexer instances at the same ClickHouse database.
