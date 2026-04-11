import { useState, useEffect } from 'react';
import type { NormalizedTx } from '../types/api';
import { useFilterStore } from '../stores/filterStore';
import { usePriceEnrichment } from '../api/hooks';
import { truncateHash, truncateAddress, formatTimestamp, formatValue, formatUsd, timestampToDateStr } from '../utils/formatters';
import { SpamTag } from './SpamTag';
import { FailedTag } from './FailedTag';
import { UnconfirmedTag } from './UnconfirmedTag';
import { TxDetail } from './TxDetail';
import { AddressHoverCard } from './AddressHoverCard';

interface TxTableProps {
  transactions: NormalizedTx[];
  chain: string;
  address: string;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onAddressClick: (chain: string, address: string) => void;
}

type SortField = 'timestamp' | 'value' | 'block';
type SortDir = 'asc' | 'desc';

export function TxTable({
  transactions,
  chain,
  address,
  page,
  totalPages,
  onPageChange,
  onAddressClick,
}: TxTableProps) {
  const { showSpam, showFailed } = useFilterStore();
  const [sortField, setSortField] = useState<SortField>('timestamp');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selectedTx, setSelectedTx] = useState<NormalizedTx | null>(null);

  const enrichMutation = usePriceEnrichment(chain, address);

  useEffect(() => {
    if (transactions.length === 0) return;

    const queries = transactions
      .filter((tx) => tx.value_usd_at_time === null && tx.timestamp > 0)
      .map((tx) => ({
        token: tx.token,
        date: timestampToDateStr(tx.timestamp),
        tx_hash: tx.tx_hash,
      }));

    if (queries.length > 0) {
      enrichMutation.mutate({ transactions: queries });
    }
  }, [transactions, page]);

  let filtered = transactions;
  if (!showSpam) {
    filtered = filtered.filter((tx) => tx.spam_score === 'clean');
  }
  if (!showFailed) {
    filtered = filtered.filter((tx) => tx.status !== 'failed');
  }

  const sorted = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === 'timestamp') {
      cmp = a.timestamp - b.timestamp;
    } else if (sortField === 'value') {
      cmp = Number(BigInt(a.value) - BigInt(b.value));
    } else if (sortField === 'block') {
      cmp = a.block - b.block;
    }
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortIcon = (field: SortField) => {
    if (sortField !== field) return ' \u2195';
    return sortDir === 'asc' ? ' \u2191' : ' \u2193';
  };

  return (
    <div>
      {selectedTx && (
        <TxDetail
          tx={selectedTx}
          chain={chain}
          onClose={() => setSelectedTx(null)}
          onAddressClick={(c, a) => {
            setSelectedTx(null);
            onAddressClick(c, a);
          }}
        />
      )}
      <div className="overflow-x-auto cs-card" style={{ borderRadius: '12px' }}>
        <table className="w-full text-sm text-left">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--cs-border)' }}>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold" style={{ color: 'var(--cs-text-muted)' }}>Tx Hash</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold" style={{ color: 'var(--cs-text-muted)' }}>Type</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold" style={{ color: 'var(--cs-text-muted)' }}>From</th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold" style={{ color: 'var(--cs-text-muted)' }}>To</th>
              <th
                className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold cursor-pointer"
                style={{ color: 'var(--cs-text-muted)' }}
                onClick={() => handleSort('value')}
              >
                Value{sortIcon('value')}
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold" style={{ color: 'var(--cs-text-muted)' }}>USD</th>
              <th
                className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold cursor-pointer"
                style={{ color: 'var(--cs-text-muted)' }}
                onClick={() => handleSort('timestamp')}
              >
                Time{sortIcon('timestamp')}
              </th>
              <th className="px-4 py-3 text-xs uppercase tracking-wider font-display font-semibold" style={{ color: 'var(--cs-text-muted)' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((tx) => (
              <TxRow
                key={`${tx.tx_hash}-${tx.tx_type}`}
                tx={tx}
                chain={chain}
                lookupAddress={address}
                onAddressClick={onAddressClick}
                onSelect={() => setSelectedTx(tx)}
              />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm font-display" style={{ color: 'var(--cs-text-muted)' }}>
                  No transactions to display
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-4">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="cs-btn-ghost"
          >
            Previous
          </button>
          <span className="text-sm font-mono" style={{ color: 'var(--cs-text-secondary)' }}>
            {page} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="cs-btn-ghost"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function TxRow({
  tx,
  chain,
  lookupAddress,
  onAddressClick,
  onSelect,
}: {
  tx: NormalizedTx;
  chain: string;
  lookupAddress: string;
  onAddressClick: (chain: string, address: string) => void;
  onSelect: () => void;
}) {
  const isFailed = tx.status === 'failed';
  const rowStyle = isFailed ? { opacity: 0.5, textDecoration: 'line-through' } : {};

  const isReceived =
    chain === 'eth'
      ? (tx.to_address || '').toLowerCase() === lookupAddress.toLowerCase()
      : tx.from_address?.toLowerCase() !== lookupAddress.toLowerCase();

  return (
    <tr
      className="cs-table-row cursor-pointer"
      style={{ ...rowStyle, borderBottom: '1px solid var(--cs-border)' }}
      onClick={onSelect}
    >
      <td className="px-4 py-3 font-mono text-xs">
        <a
          href={chain === 'eth' ? `https://etherscan.io/tx/${tx.tx_hash}` : `https://blockstream.info/tx/${tx.tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--cs-accent)' }}
          className="hover:underline"
        >
          {truncateHash(tx.tx_hash)}
        </a>
      </td>
      <td className="px-4 py-3">
        <span className="text-xs font-display" style={{ color: 'var(--cs-text-muted)' }}>
          {tx.method_name || tx.tx_type}
        </span>
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        {tx.from_address ? (
          <AddressHoverCard address={tx.from_address} chain={chain} onAddressClick={onAddressClick}>
            <button
              onClick={(e) => { e.stopPropagation(); onAddressClick(chain, tx.from_address!); }}
              style={{ color: 'var(--cs-accent)' }}
              className="hover:underline"
            >
              {truncateAddress(tx.from_address)}
            </button>
          </AddressHoverCard>
        ) : (
          <span style={{ color: 'var(--cs-text-dim)' }}>&mdash;</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        {tx.to_address ? (
          <AddressHoverCard address={tx.to_address} chain={chain} onAddressClick={onAddressClick}>
            <button
              onClick={(e) => { e.stopPropagation(); onAddressClick(chain, tx.to_address!); }}
              style={{ color: 'var(--cs-accent)' }}
              className="hover:underline"
            >
              {truncateAddress(tx.to_address)}
            </button>
          </AddressHoverCard>
        ) : (
          <span style={{ color: 'var(--cs-text-dim)' }}>&mdash;</span>
        )}
      </td>
      <td className="px-4 py-3 font-mono text-xs">
        <span style={{ color: isReceived ? 'var(--cs-green)' : 'var(--cs-red)' }}>
          {isReceived ? '+' : '-'}{formatValue(tx.value_human, tx.token)}
        </span>
      </td>
      <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
        {formatUsd(tx.value_usd_at_time)}
      </td>
      <td className="px-4 py-3 text-xs font-mono whitespace-nowrap" style={{ color: 'var(--cs-text-muted)' }}>
        {formatTimestamp(tx.timestamp)}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          {tx.status === 'failed' && <FailedTag />}
          {tx.spam_score !== 'clean' && <SpamTag />}
          {!tx.finalized && tx.confirmations !== null && (
            <UnconfirmedTag confirmations={tx.confirmations} chain={chain} />
          )}
        </div>
      </td>
    </tr>
  );
}
