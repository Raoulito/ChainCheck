import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { NormalizedTx } from '../types/api';
import { bigIntToChartNumber } from '../utils/formatters';

interface BalanceChartProps {
  transactions: NormalizedTx[];
  address: string;
  chain: string;
}

export function BalanceChart({ transactions, address, chain }: BalanceChartProps) {
  const decimals = chain === 'btc' ? 8 : 18;
  const token = chain === 'btc' ? 'BTC' : 'ETH';

  const chartData = useMemo(() => {
    if (transactions.length === 0) return [];

    const sorted = [...transactions]
      .filter(tx => tx.status !== 'failed')
      .sort((a, b) => a.timestamp - b.timestamp);

    let balance = 0n;
    const addr = address.toLowerCase();
    const points: { date: string; balance: number; timestamp: number }[] = [];

    for (const tx of sorted) {
      const value = BigInt(tx.value);
      const from = tx.from_address?.toLowerCase();
      const to = tx.to_address?.toLowerCase();

      if (from === addr) {
        balance -= value;
      } else if (to === addr) {
        balance += value;
      }

      const dateStr = new Date(tx.timestamp * 1000).toISOString().split('T')[0];
      points.push({
        date: dateStr,
        balance: bigIntToChartNumber(balance.toString(), decimals),
        timestamp: tx.timestamp,
      });
    }

    const byDate = new Map<string, typeof points[0]>();
    for (const p of points) {
      byDate.set(p.date, p);
    }
    return Array.from(byDate.values());
  }, [transactions, address, decimals]);

  if (chartData.length === 0) return null;

  return (
    <div>
      <h4 className="text-xs font-semibold font-display uppercase tracking-wider mb-3" style={{ color: 'var(--cs-text-muted)' }}>Balance History</h4>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2a3a" />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4a5568' }} />
          <YAxis
            tick={{ fontSize: 10, fill: '#4a5568' }}
            label={{ value: token, angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#4a5568' } }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#0f1420', border: '1px solid #1e2a3a', borderRadius: '8px', fontFamily: 'var(--font-mono)' }}
            labelStyle={{ color: '#e8ecf4' }}
            formatter={(value: number) => [`${value} ${token}`, 'Balance']}
          />
          <Line
            dataKey="balance"
            stroke="#00d4aa"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
