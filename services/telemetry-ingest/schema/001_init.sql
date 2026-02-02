-- ClickHouse schema for Syntra telemetry
-- Run against your ClickHouse instance:
--   clickhouse-client --multiquery < 001_init.sql

CREATE DATABASE IF NOT EXISTS syntra_telemetry;

-- ============================================================
-- TRACES (spans)
-- ============================================================
CREATE TABLE IF NOT EXISTS syntra_telemetry.traces
(
    trace_id         String,
    span_id          String,
    parent_span_id   String        DEFAULT '',
    service_id       UUID,
    deployment_id    String        DEFAULT '',
    operation_name   String,
    span_kind        LowCardinality(String) DEFAULT 'internal',
    start_time       DateTime64(9) DEFAULT now64(9),
    duration_ns      UInt64        DEFAULT 0,
    status_code      LowCardinality(String) DEFAULT 'unset',
    status_message   String        DEFAULT '',
    attributes       Map(String, String),
    events           String        DEFAULT '[]',

    -- Materialized columns for fast filtering
    http_method      LowCardinality(String) MATERIALIZED attributes['http.method'],
    http_status_code UInt16                 MATERIALIZED toUInt16OrZero(attributes['http.status_code']),
    http_route       String                 MATERIALIZED attributes['http.route'],

    -- Partition and sort
    _date            Date                   MATERIALIZED toDate(start_time)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (service_id, _date, trace_id, start_time)
TTL toDateTime(start_time) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Secondary index on trace_id for lookups
ALTER TABLE syntra_telemetry.traces ADD INDEX IF NOT EXISTS idx_trace_id trace_id TYPE bloom_filter(0.01) GRANULARITY 4;
ALTER TABLE syntra_telemetry.traces ADD INDEX IF NOT EXISTS idx_operation operation_name TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 4;

-- ============================================================
-- LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS syntra_telemetry.logs
(
    timestamp        DateTime64(9) DEFAULT now64(9),
    service_id       UUID,
    deployment_id    String        DEFAULT '',
    level            LowCardinality(String) DEFAULT 'info',
    message          String,
    attributes       Map(String, String),
    trace_id         Nullable(String),
    span_id          Nullable(String),
    source           LowCardinality(String) DEFAULT 'stdout',

    _date            Date          MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (service_id, _date, level, timestamp)
TTL toDateTime(timestamp) + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

ALTER TABLE syntra_telemetry.logs ADD INDEX IF NOT EXISTS idx_log_message message TYPE tokenbf_v1(10240, 3, 0) GRANULARITY 4;
ALTER TABLE syntra_telemetry.logs ADD INDEX IF NOT EXISTS idx_log_trace trace_id TYPE bloom_filter(0.01) GRANULARITY 4;

-- ============================================================
-- METRICS (raw)
-- ============================================================
CREATE TABLE IF NOT EXISTS syntra_telemetry.metrics_raw
(
    timestamp        DateTime      DEFAULT now(),
    service_id       UUID,
    server_id        UUID          DEFAULT '00000000-0000-0000-0000-000000000000',
    metric_name      LowCardinality(String),
    metric_type      LowCardinality(String) DEFAULT 'gauge',
    value            Float64       DEFAULT 0,
    labels           Map(String, String),

    _date            Date          MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (service_id, metric_name, _date, timestamp)
TTL timestamp + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

-- ============================================================
-- METRICS (1-minute aggregation via materialized view)
-- ============================================================
CREATE TABLE IF NOT EXISTS syntra_telemetry.metrics_1m
(
    timestamp        DateTime,
    service_id       UUID,
    server_id        UUID,
    metric_name      LowCardinality(String),
    metric_type      LowCardinality(String),
    min_value        AggregateFunction(min, Float64),
    max_value        AggregateFunction(max, Float64),
    avg_value        AggregateFunction(avg, Float64),
    sum_value        AggregateFunction(sum, Float64),
    count            AggregateFunction(count, UInt64),
    labels           Map(String, String)
)
ENGINE = AggregatingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, metric_name, timestamp)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

CREATE MATERIALIZED VIEW IF NOT EXISTS syntra_telemetry.metrics_1m_mv
TO syntra_telemetry.metrics_1m
AS
SELECT
    toStartOfMinute(timestamp) AS timestamp,
    service_id,
    server_id,
    metric_name,
    any(metric_type)            AS metric_type,
    minState(value)             AS min_value,
    maxState(value)             AS max_value,
    avgState(value)             AS avg_value,
    sumState(value)             AS sum_value,
    countState(toUInt64(1))     AS count,
    anyLast(labels)             AS labels
FROM syntra_telemetry.metrics_raw
GROUP BY
    toStartOfMinute(timestamp),
    service_id,
    server_id,
    metric_name;

-- ============================================================
-- ERRORS (denormalized for fast queries; also in PG error_groups)
-- ============================================================
CREATE TABLE IF NOT EXISTS syntra_telemetry.errors
(
    timestamp        DateTime64(9) DEFAULT now64(9),
    service_id       UUID,
    deployment_id    String        DEFAULT '',
    error_type       String,
    message          String,
    stack_trace      String        DEFAULT '',
    fingerprint      String,
    trace_id         Nullable(String),
    span_id          Nullable(String),
    user_id          Nullable(String),
    attributes       Map(String, String),

    _date            Date          MATERIALIZED toDate(timestamp)
)
ENGINE = MergeTree()
PARTITION BY toYYYYMM(_date)
ORDER BY (service_id, fingerprint, _date, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY
SETTINGS index_granularity = 8192;

ALTER TABLE syntra_telemetry.errors ADD INDEX IF NOT EXISTS idx_error_fp fingerprint TYPE bloom_filter(0.01) GRANULARITY 4;
