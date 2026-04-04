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

      // Token distribution
      tokens.set(tx.token, (tokens.get(tx.token) ?? 0) + 1);
    }

    // Top counterparties
    const topCounterparties: CounterpartyStats[] = Array.from(counterparties.entries())
      .sort(([, a], [, b]) => (b.volume > a.volume ? 1 : -1))
      .slice(0, 10)
      .map(([addr, data]) => ({
        address: addr,
        volume: bigIntToChartNumber(data.volume.toString(), decimals),
        txCount: data.count,
      }));

    // Token distribution
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
    <div className="space-y-4">
      {/* Inflow/Outflow */}
      <div>
        <h4 className="text-xs font-medium text-gray-300 mb-2">Inflow vs Outflow</h4>
        <div className="grid grid-cols-3 gap-3 text-xs">
          <div className="bg-gray-700/50 rounded p-2">
            <span className="text-gray-500">Inflow</span>
            <p className="text-green-400 font-medium">{stats.inflowNum.toFixed(4)} {token}</p>
          </div>
          <div className="bg-gray-700/50 rounded p-2">
            <span className="text-gray-500">Outflow</span>
            <p className="text-red-400 font-medium">{stats.outflowNum.toFixed(4)} {token}</p>
          </div>
          <div className="bg-gray-700/50 rounded p-2">
            <span className="text-gray-500">In/Out Ratio</span>
            <p className="text-gray-200 font-medium">{stats.ratio}</p>
          </div>
        </div>
      </div>

      {/* Top Counterparties */}
      <div>
        <h4 className="text-xs font-medium text-gray-300 mb-2">Top Counterparties</h4>
        <div className="space-y-1">
          {stats.topCounterparties.map((cp) => (
            <div key={cp.address} className="flex items-center justify-between text-xs py-1 px-2 hover:bg-gray-700/50 rounded">
              <button
                className="font-mono text-blue-400 hover:text-blue-300 hover:underline"
                onClick={() => onAddressClick?.(chain, cp.address)}
              >
                {truncateAddress(cp.address, 8)}
              </button>
              <span className="text-gray-400">
                {cp.volume.toFixed(4)} {token} ({cp.txCount} txs)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Token Distribution */}
      {stats.tokenDist.length > 1 && (
        <div>
          <h4 className="text-xs font-medium text-gray-300 mb-2">Token Distribution</h4>
          <div className="space-y-1">
            {stats.tokenDist.map(([tkn, count]) => (
              <div key={tkn} className="flex items-center justify-between text-xs py-1 px-2">
                <span className="text-gray-300">{tkn}</span>
                <span className="text-gray-500">{count} txs</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
