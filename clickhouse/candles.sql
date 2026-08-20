-- OHLCV candle layer over the indexer's ClickHouse fill streams.
--
-- Apply AFTER the indexer has started once (it creates the envio_history_*
-- source tables). Idempotent: everything is CREATE ... IF NOT EXISTS.
--
--   clickhouse-client --host $ENVIO_CLICKHOUSE_HOST -d $ENVIO_CLICKHOUSE_DATABASE \
--     --user $ENVIO_CLICKHOUSE_USERNAME --password $ENVIO_CLICKHOUSE_PASSWORD \
--     --queries-file clickhouse/candles.sql
--
-- Design notes:
-- * 1-minute base candles per tokenId in an AggregatingMergeTree; roll up to
--   any coarser interval at query time (see docs/clickhouse-queries.md).
-- * Prices are collateral-per-token in [0, 1] (both sides 6-decimal scaled).
-- * Fill rows are insert-once, so the materialized views see each fill
--   exactly once. Chain reorg rollbacks delete rows from the source tables
--   without reversing the aggregates — on Polygon this is shallow and rare;
--   rebuild a candle partition from the source table if it ever matters.
-- * V1 fills (OrderFilledEvent) put the collateral leg on whichever side has
--   assetId 0; V2 fills (V2OrderFill) carry an explicit side.

CREATE TABLE IF NOT EXISTS polymarket_candles_1m
(
  `tokenId` String,
  `bucket` DateTime,
  `open` AggregateFunction(argMin, Float64, DateTime),
  `high` AggregateFunction(max, Float64),
  `low` AggregateFunction(min, Float64),
  `close` AggregateFunction(argMax, Float64, DateTime),
  `volume` AggregateFunction(sum, Decimal(38, 0)),
  `trades` AggregateFunction(count)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(bucket)
ORDER BY (tokenId, bucket);

-- V1 exchange fills: collateral side is the assetId-0 leg.
CREATE MATERIALIZED VIEW IF NOT EXISTS polymarket_candles_1m_from_v1
TO polymarket_candles_1m
AS
SELECT
  if(`makerAssetId` = '0', `takerAssetId`, `makerAssetId`) AS tokenId,
  toStartOfMinute(toDateTime(`timestamp`)) AS bucket,
  argMinState(
    toFloat64(if(`makerAssetId` = '0', `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`makerAssetId` = '0', `takerAmountFilled`, `makerAmountFilled`)),
    toDateTime(`timestamp`)) AS open,
  maxState(
    toFloat64(if(`makerAssetId` = '0', `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`makerAssetId` = '0', `takerAmountFilled`, `makerAmountFilled`))) AS high,
  minState(
    toFloat64(if(`makerAssetId` = '0', `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`makerAssetId` = '0', `takerAmountFilled`, `makerAmountFilled`))) AS low,
  argMaxState(
    toFloat64(if(`makerAssetId` = '0', `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`makerAssetId` = '0', `takerAmountFilled`, `makerAmountFilled`)),
    toDateTime(`timestamp`)) AS close,
  sumState(if(`makerAssetId` = '0', `makerAmountFilled`, `takerAmountFilled`)) AS volume,
  countState() AS trades
FROM envio_history_OrderFilledEvent
WHERE if(`makerAssetId` = '0', `takerAmountFilled`, `makerAmountFilled`) > 0
GROUP BY tokenId, bucket;

-- V2 exchange fills: side 0 = BUY (maker pays collateral), 1 = SELL.
CREATE MATERIALIZED VIEW IF NOT EXISTS polymarket_candles_1m_from_v2
TO polymarket_candles_1m
AS
SELECT
  `tokenId` AS tokenId,
  toStartOfMinute(toDateTime(`timestamp`)) AS bucket,
  argMinState(
    toFloat64(if(`side` = 0, `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`side` = 0, `takerAmountFilled`, `makerAmountFilled`)),
    toDateTime(`timestamp`)) AS open,
  maxState(
    toFloat64(if(`side` = 0, `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`side` = 0, `takerAmountFilled`, `makerAmountFilled`))) AS high,
  minState(
    toFloat64(if(`side` = 0, `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`side` = 0, `takerAmountFilled`, `makerAmountFilled`))) AS low,
  argMaxState(
    toFloat64(if(`side` = 0, `makerAmountFilled`, `takerAmountFilled`))
      / toFloat64(if(`side` = 0, `takerAmountFilled`, `makerAmountFilled`)),
    toDateTime(`timestamp`)) AS close,
  sumState(if(`side` = 0, `makerAmountFilled`, `takerAmountFilled`)) AS volume,
  countState() AS trades
FROM envio_history_V2OrderFill
WHERE if(`side` = 0, `takerAmountFilled`, `makerAmountFilled`) > 0
GROUP BY tokenId, bucket;

-- Backfill: the views above only see rows inserted after they exist. If the
-- indexer synced first, replay the historical fills once per source:
--
-- INSERT INTO polymarket_candles_1m
-- SELECT <same SELECT as polymarket_candles_1m_from_v1>;
-- INSERT INTO polymarket_candles_1m
-- SELECT <same SELECT as polymarket_candles_1m_from_v2>;
