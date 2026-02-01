'use client';

import { useEffect, useState } from 'react';

interface MetricsCardProps {
  title: string;
  value: number;
  unit: string;
  icon?: React.ReactNode;
  trend?: 'up' | 'down' | 'stable';
  trendValue?: number;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
  maxValue?: number;
}

const colorClasses = {
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  yellow: 'bg-yellow-500',
  red: 'bg-red-500',
  purple: 'bg-purple-500',
};

const trendIcons = {
  up: '↑',
  down: '↓',
  stable: '→',
};

export function MetricsCard({
  title,
  value,
  unit,
  icon,
  trend,
  trendValue,
  color = 'blue',
  maxValue = 100,
}: MetricsCardProps) {
  const percentage = Math.min((value / maxValue) * 100, 100);

  const getStatusColor = () => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 70) return 'text-yellow-500';
    return 'text-green-500';
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-500">{icon}</span>}
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</h3>
        </div>
        {trend && (
          <span className={`text-xs ${trend === 'up' ? 'text-red-500' : trend === 'down' ? 'text-green-500' : 'text-gray-500'}`}>
            {trendIcons[trend]} {trendValue !== undefined ? `${trendValue.toFixed(1)}%` : ''}
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-1 mb-3">
        <span className={`text-2xl font-bold ${getStatusColor()}`}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-300 ${colorClasses[color]}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
