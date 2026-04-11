import { useMemo } from 'react';
import type { NormalizedTx } from '../types/api';
import { bigIntToChartNumber, truncateAddress } from '../utils/formatters';

interface StatsPanelProps {
  transactions: NormalizedTx[];
  address: string;
  chain: string;
  onAddressClick?: (chain: string, address: string) => void;
}

interface CounterpartyStats {
  address: string;
  volume: number;
  txCount: number;
}

export function StatsPanel({ transactions, address, chain, onAddressClick }: StatsPanelProps) {
  const decimals = chain === 'btc' ? 8 : 18;
  const token = chain === 'btc' ? 'BTC' : 'ETH';
  const addr = address.toLowerCase();

  const stats = useMemo(() => {
    const counterparties = new Map<string, { volume: bigint; count: number }>();
    const tokens = new Map<string, number>();
    let inflow = 0n;
    let outflow = 0n;
    let totalVolume = 0n;

    for (const tx of transactions) {
      if (tx.status === 'failed') continue;
      const value = BigInt(tx.value);
      totalVolume += value;

      const from = tx.from_address?.toLowerCase();
      const to = tx.to_address?.toLowerCase();

      if (from === addr && to) {
        outflow += value;
        const cp = counterparties.get(to) ?? { volume: 0n, count: 0 };
        cp.volume += value;
        cp.count++;
        counterparties.set(to, cp);
      } else if (to === addr && from) {
        inflow += value;
        const cp = counterparties.get(from) ?? { volume: 0n, count: 0 };
        cp.volume += value;
        cp.count++;
        counterparties.set(from, cp);
      }

      tokens.set(tx.token, (tokens.get(tx.token) ?? 0) + 1);
    }

    const topCounterparties: CounterpartyStats[] = Array.from(counterparties.entries())
      .sort(([, a], [, b]) => (b.volume > a.volume ? 1 : -1))
      .slice(0, 10)
      .map(([addr, data]) => ({
        address: addr,
        volume: bigIntToChartNumber(data.volume.toString(), decimals),
        txCount: data.count,
      }));

    const tokenDist = Array.from(tokens.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const inflowNum = bigIntToChartNumber(inflow.toString(), decimals);
    const outflowNum = bigIntToChartNumber(outflow.toString(), decimals);
    const ratio = outflowNum > 0 ? (inflowNum / outflowNum).toFixed(2) : 'N/A';

    return { topCounterparties, tokenDist, inflowNum, outflowNum, ratio, totalVolume };
  }, [transactions, addr, decimals]);

  if (transactions.length === 0) return null;

  return (
    <div className="space-y-5">
      {/* Inflow/Outflow */}
      <div>
        <h4 className="text-xs font-semibold font-display uppercase tracking-wider mb-2" style={{ color: 'var(--cs-text-muted)' }}>Inflow vs Outflow</h4>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="cs-card-surface p-3">
            <span className="font-display" style={{ color: 'var(--cs-text-muted)' }}>Inflow</span>
            <p className="font-mono font-semibold mt-0.5" style={{ color: 'var(--cs-green)' }}>{stats.inflowNum.toFixed(4)} {token}</p>
          </div>
          <div className="cs-card-surface p-3">
            <span className="font-display" style={{ color: 'var(--cs-text-muted)' }}>Outflow</span>
            <p className="font-mono font-semibold mt-0.5" style={{ color: 'var(--cs-red)' }}>{stats.outflowNum.toFixed(4)} {token}</p>
          </div>
          <div className="cs-card-surface p-3">
            <span className="font-display" style={{ color: 'var(--cs-text-muted)' }}>In/Out Ratio</span>
            <p className="font-mono font-semibold mt-0.5" style={{ color: 'var(--cs-text-primary)' }}>{stats.ratio}</p>
          </div>
        </div>
      </div>

      {/* Top Counterparties */}
      <div>
        <h4 className="text-xs font-semibold font-display uppercase tracking-wider mb-2" style={{ color: 'var(--cs-text-muted)' }}>Top Counterparties</h4>
        <div className="space-y-0.5">
          {stats.topCounterparties.map((cp) => (
            <div
              key={cp.address}
              className="flex items-center justify-between text-xs py-1.5 px-2 rounded-md transition-colors"
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--cs-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <button
                className="font-mono hover:underline"
                style={{ color: 'var(--cs-accent)' }}
                onClick={() => onAddressClick?.(chain, cp.address)}
              >
                {truncateAddress(cp.address, 8)}
              </button>
              <span className="font-mono" style={{ color: 'var(--cs-text-muted)' }}>
                {cp.volume.toFixed(4)} {token} ({cp.txCount} txs)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Token Distribution */}
      {stats.tokenDist.length > 1 && (
        <div>
          <h4 className="text-xs font-semibold font-display uppercase tracking-wider mb-2" style={{ color: 'var(--cs-text-muted)' }}>Token Distribution</h4>
          <div className="space-y-0.5">
            {stats.tokenDist.map(([tkn, count]) => (
              <div key={tkn} className="flex items-center justify-between text-xs py-1.5 px-2">
                <span className="font-display" style={{ color: 'var(--cs-text-secondary)' }}>{tkn}</span>
                <span className="font-mono" style={{ color: 'var(--cs-text-muted)' }}>{count} txs</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
