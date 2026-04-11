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

    let cumulative = 0;
    return sorted.map(d => {
      cumulative += d.volume;
      return { ...d, cumulative: parseFloat(cumulative.toFixed(4)) };
    });
  }, [transactions, granularity, decimals]);

  if (transactions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-xs font-semibold font-display uppercase tracking-wider" style={{ color: 'var(--cs-text-muted)' }}>Transaction Volume</h4>
        <div className="flex gap-1">
          {(['day', 'week', 'month'] as Granularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className="text-xs px-2.5 py-1 rounded-md font-display transition-all"
              style={
                granularity === g
                  ? { background: 'var(--cs-accent)', color: 'var(--cs-bg-deep)', fontWeight: 600 }
                  : { background: 'var(--cs-bg-surface)', color: 'var(--cs-text-muted)' }
              }
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4a5568' }} />
          <YAxis
            yAxisId="left"
            tick={{ fontSize: 10, fill: '#4a5568' }}
            label={{ value: token, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#4a5568' } }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fontSize: 10, fill: '#4a5568' }}
            label={{ value: 'USD', angle: 90, position: 'insideRight', style: { fontSize: 10, fill: '#4a5568' } }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f1420', border: '1px solid #1e2a3a', borderRadius: '8px', fontFamily: 'var(--font-mono)' }}
            labelStyle={{ color: '#e8ecf4' }}
            itemStyle={{ color: '#e8ecf4' }}
            formatter={(value: number, name: string) => {
              if (name === 'volume') return [`${value} ${token}`, 'Volume'];
              if (name === 'cumulative') return [`${value} ${token}`, 'Cumulative'];
              if (name === 'volumeUsd') return [`$${value.toLocaleString()}`, 'USD Volume'];
              return [value, name];
            }}
          />
          <Bar yAxisId="left" dataKey="volume" fill="#00d4aa" opacity={0.6} radius={[2, 2, 0, 0]} />
          {chartData.some(d => d.volumeUsd > 0) && (
            <Bar yAxisId="right" dataKey="volumeUsd" fill="#a78bfa" opacity={0.3} radius={[2, 2, 0, 0]} />
          )}
          <Line yAxisId="left" dataKey="cumulative" stroke="#00d68f" dot={false} strokeWidth={2} />
          <Brush
            dataKey="date"
            height={20}
            stroke="#1e2a3a"
            fill="#0a0e17"
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
