-- ClickHouse initialization script
-- Create database

CREATE DATABASE IF NOT EXISTS syntra_telemetry;

-- Traces table
CREATE TABLE IF NOT EXISTS syntra_telemetry.traces (
    trace_id String,
    span_id String,
    parent_span_id String,
    service_id UUID,
    deployment_id UUID,
    operation_name String,
    span_kind Enum8('internal' = 0, 'server' = 1, 'client' = 2, 'producer' = 3, 'consumer' = 4),
    start_time DateTime64(9, 'UTC'),
    duration_ns UInt64,
    status_code Enum8('unset' = 0, 'ok' = 1, 'error' = 2),
    status_message String,
    attributes Map(String, String),
    events String,

    -- Materialized columns for common queries
    http_method String MATERIALIZED attributes['http.method'],
    http_status_code UInt16 MATERIALIZED toUInt16OrZero(attributes['http.status_code']),
    http_route String MATERIALIZED attributes['http.route']
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(start_time)
ORDER BY (service_id, start_time, trace_id, span_id)
TTL start_time + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Logs table
CREATE TABLE IF NOT EXISTS syntra_telemetry.logs (
    timestamp DateTime64(9, 'UTC'),
    service_id UUID,
    deployment_id UUID,
    level Enum8('trace' = 0, 'debug' = 1, 'info' = 2, 'warn' = 3, 'error' = 4, 'fatal' = 5),
    message String,
    attributes Map(String, String),
    trace_id Nullable(String),
    span_id Nullable(String),
    source Enum8('stdout' = 0, 'stderr' = 1, 'sdk' = 2)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, timestamp)
TTL timestamp + INTERVAL 30 DAY
SETTINGS index_granularity = 8192;

-- Metrics table (raw data)
CREATE TABLE IF NOT EXISTS syntra_telemetry.metrics_raw (
    timestamp DateTime,
    service_id UUID,
    server_id UUID,
    metric_name String,
    metric_type Enum8('gauge' = 0, 'counter' = 1, 'histogram' = 2),
    value Float64,
    labels Map(String, String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, metric_name, timestamp)
TTL timestamp + INTERVAL 7 DAY
SETTINGS index_granularity = 8192;

-- Metrics aggregated (1 minute)
CREATE TABLE IF NOT EXISTS syntra_telemetry.metrics_1m (
    timestamp DateTime,
    service_id UUID,
    server_id UUID,
    metric_name String,
    metric_type Enum8('gauge' = 0, 'counter' = 1, 'histogram' = 2),
    min_value Float64,
    max_value Float64,
    avg_value Float64,
    sum_value Float64,
    count UInt64,
    labels Map(String, String)
) ENGINE = SummingMergeTree()
PARTITION BY toYYYYMM(timestamp)
ORDER BY (service_id, metric_name, timestamp, labels)
TTL timestamp + INTERVAL 30 DAY;

-- Materialized view for auto-aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS syntra_telemetry.metrics_1m_mv TO syntra_telemetry.metrics_1m AS
SELECT
    toStartOfMinute(timestamp) AS timestamp,
    service_id,
    server_id,
    metric_name,
    metric_type,
    min(value) AS min_value,
    max(value) AS max_value,
    avg(value) AS avg_value,
    sum(value) AS sum_value,
    count() AS count,
    labels
FROM syntra_telemetry.metrics_raw
GROUP BY
    toStartOfMinute(timestamp),
    service_id,
    server_id,
    metric_name,
    metric_type,
    labels;
