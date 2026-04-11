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
        accent
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

function StatCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="cs-card p-4" style={accent ? { borderColor: 'var(--cs-accent)', borderWidth: '1px' } : undefined}>
      <p className="text-xs uppercase tracking-widest font-display mb-2" style={{ color: 'var(--cs-text-muted)' }}>{label}</p>
      <p className="text-lg font-semibold font-mono" style={{ color: accent ? 'var(--cs-accent)' : 'var(--cs-text-primary)' }}>{value}</p>
      {sub && <p className="text-xs mt-1 font-mono" style={{ color: 'var(--cs-text-muted)' }}>{sub}</p>}
    </div>
  );
}
