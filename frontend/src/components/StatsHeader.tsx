import type { AddressStats } from '../types/api';
import { formatValue, formatTimestamp } from '../utils/formatters';

interface StatsHeaderProps {
  stats: AddressStats;
  chain: string;
}

export function StatsHeader({ stats, chain }: StatsHeaderProps) {
  const token = chain === 'btc' ? 'BTC' : 'ETH';
  const decimals = chain === 'btc' ? 8 : 18;
  const divisor = BigInt(10 ** decimals);

  const balance = BigInt(stats.balance) ;
  const balanceHuman = Number(balance / divisor) + Number(balance % divisor) / Number(divisor);
  const unconfirmed = BigInt(stats.balance_unconfirmed);
  const unconfirmedHuman = Number(unconfirmed / divisor) + Number(unconfirmed % divisor) / Number(divisor);

  const received = BigInt(stats.total_received);
  const receivedHuman = Number(received / divisor) + Number(received % divisor) / Number(divisor);
  const sent = BigInt(stats.total_sent);
  const sentHuman = Number(sent / divisor) + Number(sent % divisor) / Number(divisor);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <StatCard
        label="Balance"
        value={`${parseFloat(balanceHuman.toFixed(6))} ${token}`}
        sub={unconfirmed !== 0n ? `${parseFloat(unconfirmedHuman.toFixed(6))} ${token} unconfirmed` : undefined}
      />
      <StatCard
        label="Total Received"
        value={`${parseFloat(receivedHuman.toFixed(6))} ${token}`}
      />
      <StatCard
        label="Total Sent"
        value={`${parseFloat(sentHuman.toFixed(6))} ${token}`}
      />
      <StatCard
        label="Transactions"
        value={stats.tx_count.toLocaleString()}
        sub={
          stats.first_seen
            ? `${formatTimestamp(stats.first_seen)} — ${formatTimestamp(stats.last_seen ?? 0)}`
            : undefined
        }
      />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <p className="text-gray-400 text-xs uppercase tracking-wide">{label}</p>
      <p className="text-white text-lg font-semibold mt-1">{value}</p>
      {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}
