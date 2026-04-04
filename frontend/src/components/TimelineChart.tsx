import { useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Brush, CartesianGrid, Line, ComposedChart,
} from 'recharts';
import type { NormalizedTx } from '../types/api';
import { bigIntToChartNumber } from '../utils/formatters';

interface TimelineChartProps {
  transactions: NormalizedTx[];
  chain: string;
  onTimeRangeChange?: (start: number, end: number) => void;
}

type Granularity = 'day' | 'week' | 'month';

function getDateBucket(timestamp: number, granularity: Granularity): string {
  const date = new Date(timestamp * 1000);
  if (granularity === 'month') {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
  if (granularity === 'week') {
    const day = date.getDay();
    const diff = date.getDate() - day;
    const weekStart = new Date(date.setDate(diff));
    return weekStart.toISOString().split('T')[0];
  }
  return new Date(timestamp * 1000).toISOString().split('T')[0];
}

function getToken(chain: string): string {
  return chain === 'btc' ? 'BTC' : 'ETH';
}

export function TimelineChart({ transactions, chain, onTimeRangeChange }: TimelineChartProps) {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const token = getToken(chain);
  const decimals = chain === 'btc' ? 8 : 18;

  const chartData = useMemo(() => {
    const buckets = new Map<string, { volume: number; volumeUsd: number; count: number; minTs: number; maxTs: number }>();

    for (const tx of transactions) {
      if (tx.status === 'failed') continue;
      const bucket = getDateBucket(tx.timestamp, granularity);
      const existing = buckets.get(bucket) ?? { volume: 0, volumeUsd: 0, count: 0, minTs: Infinity, maxTs: -Infinity };

      existing.volume += bigIntToChartNumber(tx.value, decimals);
      if (tx.value_usd_at_time) {
        existing.volumeUsd += parseFloat(tx.value_usd_at_time);
      }
      existing.count += 1;
      existing.minTs = Math.min(existing.minTs, tx.timestamp);
      existing.maxTs = Math.max(existing.maxTs, tx.timestamp);
      buckets.set(bucket, existing);
    }

    // Sort by date
    const sorted = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        volume: parseFloat(data.volume.toFixed(4)),
        volumeUsd: parseFloat(data.volumeUsd.toFixed(2)),
        count: data.count,
        minTs: data.minTs,
        maxTs: data.maxTs,
      }));

    // Compute cumulative balance
    let cumulative = 0;
    return sorted.map(d => {
      cumulative += d.volume;
      return { ...d, cumulative: parseFloat(cumulative.toFixed(4)) };
    });
  }, [transactions, granularity, decimals]);

  if (transactions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-gray-300">Transaction Volume</h4>
        <div className="flex gap-1">
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`text-xs px-2 py-0.5 rounded ${
                granularity === g ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400'
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            label={{ value: token, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#9ca3af' } }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: '#9ca3af' }}
            label={{ value: 'USD', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#9ca3af' } }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#e5e7eb' }}
            itemStyle={{ color: '#e5e7eb' }}
            formatter={(value: number, name: string) => {
              if (name === 'volume') return [`${value} ${token}`, 'Volume'];
              if (name === 'cumulative') return [`${value} ${token}`, 'Cumulative'];
              if (name === 'volumeUsd') return [`$${value.toLocaleString()}`, 'USD Volume'];
              return [value, name];
            }}
          />
          <Bar yAxisId="left" dataKey="volume" fill="#3b82f6" opacity={0.7} />
          {chartData.some(d => d.volumeUsd > 0) && (
            <Bar yAxisId="right" dataKey="volumeUsd" fill="#8b5cf6" opacity={0.4} />
          )}
          <Line yAxisId="left" dataKey="cumulative" stroke="#22c55e" dot={false} strokeWidth={2} />
          <Brush
            dataKey="date"
            height={20}
            stroke="#4b5563"
            fill="#1f2937"
            onChange={(range) => {
              if (onTimeRangeChange && range.startIndex !== undefined && range.endIndex !== undefined) {
                const start = chartData[range.startIndex]?.minTs;
                const end = chartData[range.endIndex]?.maxTs;
                if (start && end) onTimeRangeChange(start, end);
              }
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
