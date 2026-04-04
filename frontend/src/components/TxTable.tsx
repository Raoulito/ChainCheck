import { useState, useEffect } from 'react';
import type { NormalizedTx } from '../types/api';
import { useFilterStore } from '../stores/filterStore';
import { usePriceEnrichment } from '../api/hooks';
import { truncateHash, truncateAddress, formatTimestamp, formatValue, formatUsd, timestampToDateStr } from '../utils/formatters';
import { SpamTag } from './SpamTag';
import { FailedTag } from './FailedTag';
import { UnconfirmedTag } from './UnconfirmedTag';

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

  const enrichMutation = usePriceEnrichment(chain, address);

  // Enrich prices for visible transactions
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

  // Filter
  let filtered = transactions;
  if (!showSpam) {
    filtered = filtered.filter((tx) => tx.spam_score === 'clean');
  }
  if (!showFailed) {
    filtered = filtered.filter((tx) => tx.status !== 'failed');
  }

  // Sort
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
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-gray-400 uppercase border-b border-gray-700">
            <tr>
              <th className="px-3 py-3">Tx Hash</th>
              <th className="px-3 py-3">Type</th>
              <th className="px-3 py-3">From</th>
              <th className="px-3 py-3">To</th>
              <th
                className="px-3 py-3 cursor-pointer hover:text-gray-200"
                onClick={() => handleSort('value')}
              >
                Value{sortIcon('value')}
              </th>
              <th className="px-3 py-3">USD</th>
              <th
                className="px-3 py-3 cursor-pointer hover:text-gray-200"
                onClick={() => handleSort('timestamp')}
              >
                Time{sortIcon('timestamp')}
              </th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sorted.map((tx) => (
              <TxRow
                key={`${tx.tx_hash}-${tx.tx_type}`}
                tx={tx}
                chain={chain}
                lookupAddress={address}
                onAddressClick={onAddressClick}
              />
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  No transactions to display
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded text-sm"
          >
            Previous
          </button>
          <span className="text-gray-400 text-sm">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-gray-300 rounded text-sm"
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
}: {
  tx: NormalizedTx;
  chain: string;
  lookupAddress: string;
  onAddressClick: (chain: string, address: string) => void;
}) {
  const isFailed = tx.status === 'failed';
  const rowClass = isFailed ? 'opacity-50 line-through' : '';

  const isReceived =
    chain === 'eth'
      ? (tx.to_address || '').toLowerCase() === lookupAddress.toLowerCase()
      : tx.from_address?.toLowerCase() !== lookupAddress.toLowerCase();

  return (
    <tr className={`hover:bg-gray-800/50 ${rowClass}`}>
      <td className="px-3 py-3 font-mono text-xs">
        <a
          href={chain === 'eth' ? `https://etherscan.io/tx/${tx.tx_hash}` : `https://blockstream.info/tx/${tx.tx_hash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:text-blue-300"
        >
          {truncateHash(tx.tx_hash)}
        </a>
      </td>
      <td className="px-3 py-3">
        <span className="text-xs text-gray-400">
          {tx.method_name || tx.tx_type}
        </span>
      </td>
      <td className="px-3 py-3 font-mono text-xs">
        {tx.from_address ? (
          <button
            onClick={() => onAddressClick(chain, tx.from_address!)}
            className="text-blue-400 hover:text-blue-300"
          >
            {truncateAddress(tx.from_address)}
          </button>
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </td>
      <td className="px-3 py-3 font-mono text-xs">
        {tx.to_address ? (
          <button
            onClick={() => onAddressClick(chain, tx.to_address!)}
            className="text-blue-400 hover:text-blue-300"
          >
            {truncateAddress(tx.to_address)}
          </button>
        ) : (
          <span className="text-gray-600">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={isReceived ? 'text-green-400' : 'text-red-400'}>
          {isReceived ? '+' : '-'}{formatValue(tx.value_human, tx.token)}
        </span>
      </td>
      <td className="px-3 py-3 text-gray-400 text-xs">
        {formatUsd(tx.value_usd_at_time)}
      </td>
      <td className="px-3 py-3 text-gray-400 text-xs whitespace-nowrap">
        {formatTimestamp(tx.timestamp)}
      </td>
      <td className="px-3 py-3">
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
