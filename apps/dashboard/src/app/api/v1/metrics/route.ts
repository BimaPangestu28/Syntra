/**
 * GET /api/v1/metrics - Query metrics from ClickHouse
 *
 * Query params:
 * - service_id: Filter by service
 * - server_id: Filter by server
 * - metric_name: Filter by metric name
 * - start: Start time (ISO string)
 * - end: End time (ISO string)
 * - aggregated: Use 1-minute aggregated table (default: true for ranges > 1h)
 * - group_by: Group results by time interval (1m, 5m, 15m, 1h)
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getClickHouseClient } from '@/lib/clickhouse/client';

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID();

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required',
            request_id: requestId,
          },
        },
        { status: 401 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const serviceId = searchParams.get('service_id');
    const serverId = searchParams.get('server_id');
    const metricName = searchParams.get('metric_name');
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    const groupBy = searchParams.get('group_by') || '1m';

    const startTime = start ? new Date(start) : new Date(Date.now() - 3600000);
    const endTime = end ? new Date(end) : new Date();
    const rangeMs = endTime.getTime() - startTime.getTime();
    const useAggregated = searchParams.get('aggregated') !== 'false' && rangeMs > 3600000;

    const client = getClickHouseClient();

    // Build conditions
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (serviceId) {
      conditions.push('service_id = {serviceId:UUID}');
      params.serviceId = serviceId;
    }
    if (serverId) {
      conditions.push('server_id = {serverId:UUID}');
      params.serverId = serverId;
    }
    if (metricName) {
      conditions.push('metric_name = {metricName:String}');
      params.metricName = metricName;
    }

    conditions.push('timestamp >= {startTime:DateTime}');
    params.startTime = startTime.toISOString().replace('T', ' ').slice(0, 19);
    conditions.push('timestamp <= {endTime:DateTime}');
    params.endTime = endTime.toISOString().replace('T', ' ').slice(0, 19);

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query for available metric names
    const namesQuery = `
      SELECT DISTINCT metric_name, metric_type
      FROM ${useAggregated ? 'metrics_1m' : 'metrics_raw'}
      ${whereClause}
      ORDER BY metric_name
      LIMIT 100
    `;

    const namesResult = await client.query({
      query: namesQuery,
      query_params: params,
      format: 'JSONEachRow',
    });
    const metricNames = await namesResult.json<{ metric_name: string; metric_type: string }[]>();

    // Query time series data
    let timeSeriesData: unknown[] = [];
    if (metricName) {
      const intervalMap: Record<string, string> = {
        '1m': 'toStartOfMinute(timestamp)',
        '5m': 'toStartOfFiveMinutes(timestamp)',
        '15m': 'toStartOfFifteenMinutes(timestamp)',
        '1h': 'toStartOfHour(timestamp)',
      };
      const interval = intervalMap[groupBy] || intervalMap['1m'];

      let tsQuery: string;
      if (useAggregated) {
        tsQuery = `
          SELECT
            ${interval} as bucket,
            avg(avg_value) as avg_value,
            min(min_value) as min_value,
            max(max_value) as max_value,
            sum(sum_value) as sum_value,
            sum(count) as count
          FROM metrics_1m
          ${whereClause}
          GROUP BY bucket
          ORDER BY bucket ASC
          LIMIT 1000
        `;
      } else {
        tsQuery = `
          SELECT
            ${interval} as bucket,
            avg(value) as avg_value,
            min(value) as min_value,
            max(value) as max_value,
            sum(value) as sum_value,
            count() as count
          FROM metrics_raw
          ${whereClause}
          GROUP BY bucket
          ORDER BY bucket ASC
          LIMIT 1000
        `;
      }

      const tsResult = await client.query({
        query: tsQuery,
        query_params: params,
        format: 'JSONEachRow',
      });
      timeSeriesData = await tsResult.json();
    }

    // Query summary stats for each metric
    let summaryQuery: string;
    if (useAggregated) {
      summaryQuery = `
        SELECT
          metric_name,
          metric_type,
          min(min_value) as min_value,
          max(max_value) as max_value,
          avg(avg_value) as avg_value,
          sum(sum_value) as total,
          sum(count) as data_points
        FROM metrics_1m
        ${whereClause}
        GROUP BY metric_name, metric_type
        ORDER BY metric_name
        LIMIT 100
      `;
    } else {
      summaryQuery = `
        SELECT
          metric_name,
          metric_type,
          min(value) as min_value,
          max(value) as max_value,
          avg(value) as avg_value,
          sum(value) as total,
          count() as data_points
        FROM metrics_raw
        ${whereClause}
        GROUP BY metric_name, metric_type
        ORDER BY metric_name
        LIMIT 100
      `;
    }

    const summaryResult = await client.query({
      query: summaryQuery,
      query_params: params,
      format: 'JSONEachRow',
    });
    const summary = await summaryResult.json();

    return NextResponse.json({
      success: true,
      data: {
        metrics: metricNames,
        time_series: timeSeriesData,
        summary,
      },
      meta: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        aggregated: useAggregated,
        group_by: groupBy,
      },
    });
  } catch (error) {
    console.error('[API] Metrics error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to query metrics',
          request_id: requestId,
        },
      },
      { status: 500 }
    );
  }
}
