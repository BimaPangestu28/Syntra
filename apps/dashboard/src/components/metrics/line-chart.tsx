'use client';

import { useMemo } from 'react';

interface DataPoint {
  timestamp: number;
  value: number;
}

interface LineChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  showLabels?: boolean;
  title?: string;
  unit?: string;
  minValue?: number;
  maxValue?: number;
}

export function LineChart({
  data,
  width = 400,
  height = 200,
  color = '#3b82f6',
  showGrid = true,
  showLabels = true,
  title,
  unit = '',
  minValue,
  maxValue,
}: LineChartProps) {
  const chartData = useMemo(() => {
    if (!data || data.length === 0) {
      return { points: '', min: 0, max: 100, area: '' };
    }

    const values = data.map(d => d.value);
    const min = minValue ?? Math.min(...values);
    const max = maxValue ?? Math.max(...values);
    const range = max - min || 1;

    const padding = { top: 20, right: 20, bottom: 30, left: 50 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const points = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1 || 1)) * chartWidth;
      const y = padding.top + chartHeight - ((d.value - min) / range) * chartHeight;
      return `${x},${y}`;
    }).join(' ');

    // Create area path
    const firstPoint = `${padding.left},${padding.top + chartHeight}`;
    const lastPoint = `${padding.left + chartWidth},${padding.top + chartHeight}`;
    const area = `M ${firstPoint} L ${points} L ${lastPoint} Z`;

    return { points, min, max, area, padding, chartWidth, chartHeight };
  }, [data, width, height, minValue, maxValue]);

  if (!data || data.length === 0) {
    return (
      <div
        className="flex items-center justify-center bg-gray-100 dark:bg-gray-800 rounded-lg"
        style={{ width, height }}
      >
        <span className="text-gray-500">No data available</span>
      </div>
    );
  }

  const { points, min, max, area, padding, chartWidth, chartHeight } = chartData;

  // Generate Y-axis labels
  const yLabels = [0, 25, 50, 75, 100].map(pct => {
    const value = min + (pct / 100) * (max - min);
    const y = padding!.top + chartHeight! - (pct / 100) * chartHeight!;
    return { value, y };
  });

  // Generate time labels (first, middle, last)
  const timeLabels = [
    { x: padding!.left, time: data[0]?.timestamp },
    { x: padding!.left + chartWidth! / 2, time: data[Math.floor(data.length / 2)]?.timestamp },
    { x: padding!.left + chartWidth!, time: data[data.length - 1]?.timestamp },
  ];

  const formatTime = (ts: number) => {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
      {title && (
        <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">{title}</h3>
      )}
      <svg width={width} height={height} className="overflow-visible">
        {/* Grid lines */}
        {showGrid && yLabels.map(({ y }, i) => (
          <line
            key={i}
            x1={padding!.left}
            y1={y}
            x2={padding!.left + chartWidth!}
            y2={y}
            stroke="#e5e7eb"
            strokeDasharray="4,4"
            className="dark:stroke-gray-700"
          />
        ))}

        {/* Area fill */}
        <path
          d={area}
          fill={color}
          fillOpacity={0.1}
        />

        {/* Line */}
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Data points */}
        {data.map((d, i) => {
          const x = padding!.left + (i / (data.length - 1 || 1)) * chartWidth!;
          const y = padding!.top + chartHeight! - ((d.value - min) / (max - min || 1)) * chartHeight!;
          return (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={3}
              fill={color}
              className="opacity-0 hover:opacity-100 transition-opacity cursor-pointer"
            >
              <title>{`${d.value.toFixed(1)}${unit} at ${formatTime(d.timestamp)}`}</title>
            </circle>
          );
        })}

        {/* Y-axis labels */}
        {showLabels && yLabels.map(({ value, y }, i) => (
          <text
            key={i}
            x={padding!.left - 8}
            y={y + 4}
            textAnchor="end"
            className="text-xs fill-gray-500"
          >
            {value.toFixed(0)}{unit}
          </text>
        ))}

        {/* X-axis labels */}
        {showLabels && timeLabels.map(({ x, time }, i) => (
          <text
            key={i}
            x={x}
            y={height - 8}
            textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
            className="text-xs fill-gray-500"
          >
            {formatTime(time)}
          </text>
        ))}
      </svg>
    </div>
  );
}
