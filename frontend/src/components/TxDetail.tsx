import { useState } from 'react';
import type { NormalizedTx } from '../types/api';
import { truncateAddress, formatTimestamp, formatValue, formatUsd } from '../utils/formatters';
import { FailedTag } from './FailedTag';
import { SpamTag } from './SpamTag';
import { UnconfirmedTag } from './UnconfirmedTag';

interface TxDetailProps {
  tx: NormalizedTx;
  chain: string;
  onClose: () => void;
  onAddressClick: (chain: string, address: string) => void;
}

export function TxDetail({ tx, chain, onClose, onAddressClick }: TxDetailProps) {
  const [copied, setCopied] = useState(false);
  const [showRawInput, setShowRawInput] = useState(false);

  const explorerUrl =
    chain === 'eth'
      ? `https://etherscan.io/tx/${tx.tx_hash}`
      : `https://blockstream.info/tx/${tx.tx_hash}`;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(tx.tx_hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg z-50 overflow-y-auto" style={{ background: 'var(--cs-bg-base)', borderLeft: '1px solid var(--cs-border)', boxShadow: '-20px 0 60px rgba(0,0,0,0.5)' }}>
      {/* Header */}
      <div className="sticky top-0 px-6 py-4 flex items-center justify-between" style={{ background: 'var(--cs-bg-base)', borderBottom: '1px solid var(--cs-border)' }}>
        <h2 className="text-lg font-semibold font-display" style={{ color: 'var(--cs-text-primary)' }}>Transaction Detail</h2>
        <button
          onClick={onClose}
          className="text-2xl leading-none transition-colors"
          style={{ color: 'var(--cs-text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cs-text-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cs-text-muted)'}
        >
          &times;
        </button>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Tx Hash */}
        <div>
          <DetailLabel>Tx Hash</DetailLabel>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs break-all" style={{ color: 'var(--cs-text-secondary)' }}>{tx.tx_hash}</span>
            <button onClick={handleCopy} className="shrink-0 text-xs font-display" style={{ color: 'var(--cs-accent)' }}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs mt-1 inline-block font-display"
            style={{ color: 'var(--cs-accent)' }}
          >
            Open in Explorer &rarr;
          </a>
        </div>

        {/* Status badges */}
        <div className="flex items-center gap-2">
          {tx.status === 'failed' && <FailedTag />}
          {tx.spam_score !== 'clean' && <SpamTag />}
          {!tx.finalized && tx.confirmations !== null && (
            <UnconfirmedTag confirmations={tx.confirmations} chain={chain} />
          )}
          {tx.finalized && (
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold font-display"
              style={{ background: 'var(--cs-green-dim)', color: 'var(--cs-green)', border: '1px solid var(--cs-green)' }}
            >
              Finalized
            </span>
          )}
          <span className="text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
            Block #{tx.block.toLocaleString()}
          </span>
        </div>

        {/* Timestamp */}
        <div>
          <DetailLabel>Time</DetailLabel>
          <p className="text-sm font-mono" style={{ color: 'var(--cs-text-secondary)' }}>{formatTimestamp(tx.timestamp)}</p>
        </div>

        {/* Method */}
        {tx.method_name && (
          <div>
            <DetailLabel>Function</DetailLabel>
            <p className="font-mono text-sm" style={{ color: 'var(--cs-yellow)' }}>{tx.method_name}</p>
          </div>
        )}

        {/* Chain-specific layout */}
        {chain === 'btc' ? (
          <BtcLayout tx={tx} onAddressClick={onAddressClick} />
        ) : (
          <EthLayout tx={tx} chain={chain} onAddressClick={onAddressClick} />
        )}

        {/* Value + USD */}
        <div>
          <DetailLabel>Value</DetailLabel>
          <p className="text-lg font-semibold font-mono" style={{ color: 'var(--cs-text-primary)' }}>
            {formatValue(tx.value_human, tx.token)}
          </p>
          {tx.value_usd_at_time && (
            <p className="text-sm font-mono" style={{ color: 'var(--cs-text-muted)' }}>
              {formatUsd(tx.value_usd_at_time)} at time of transaction
            </p>
          )}
        </div>

        {/* Fee */}
        {tx.fee && tx.fee !== '0' && (
          <div>
            <DetailLabel>Fee</DetailLabel>
            <p className="text-sm font-mono" style={{ color: 'var(--cs-text-secondary)' }}>
              {chain === 'eth'
                ? `${(Number(BigInt(tx.fee)) / 1e18).toFixed(8)} ETH`
                : `${(Number(BigInt(tx.fee)) / 1e8).toFixed(8)} BTC`}
            </p>
          </div>
        )}

        {/* Confirmations */}
        {tx.confirmations !== null && (
          <div>
            <DetailLabel>Confirmations</DetailLabel>
            <p className="text-sm font-mono" style={{ color: 'var(--cs-text-secondary)' }}>
              {tx.confirmations.toLocaleString()}
              {' '}
              <span style={{ color: 'var(--cs-text-muted)' }}>
                (finality threshold: {chain === 'btc' ? 6 : 64})
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function BtcLayout({
  tx,
  onAddressClick,
}: {
  tx: NormalizedTx;
  onAddressClick: (chain: string, address: string) => void;
}) {
  return (
    <div>
      <DetailLabel>Inputs &rarr; Outputs</DetailLabel>
      <div className="grid grid-cols-2 gap-4 mt-2">
        <div className="space-y-1">
          <p className="text-xs uppercase font-display" style={{ color: 'var(--cs-text-muted)' }}>Inputs</p>
          {tx.inputs?.map((inp, i) => (
            <div key={i} className="cs-card-surface p-2">
              <button
                onClick={() => inp.address && onAddressClick('btc', inp.address)}
                className="font-mono text-xs break-all hover:underline"
                style={{ color: 'var(--cs-accent)' }}
              >
                {truncateAddress(inp.address || '???')}
              </button>
              <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--cs-text-muted)' }}>
                {(Number(inp.value) / 1e8).toFixed(8)} BTC
              </p>
            </div>
          ))}
        </div>

        <div className="space-y-1">
          <p className="text-xs uppercase font-display" style={{ color: 'var(--cs-text-muted)' }}>Outputs</p>
          {tx.outputs?.map((out, i) => {
            const isChange = tx.change_output?.output_index === i;
            return (
              <div
                key={i}
                className="cs-card-surface p-2"
                style={isChange ? { borderColor: 'var(--cs-yellow)' } : undefined}
              >
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => out.address && onAddressClick('btc', out.address)}
                    className="font-mono text-xs break-all hover:underline"
                    style={{ color: 'var(--cs-accent)' }}
                  >
                    {truncateAddress(out.address || '???')}
                  </button>
                  {isChange && (
                    <span className="text-xs font-display px-1 rounded" style={{ background: 'var(--cs-yellow-dim)', color: 'var(--cs-yellow)', fontSize: '10px' }}>
                      CHANGE ({tx.change_output!.confidence})
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--cs-text-muted)' }}>
                  {(Number(out.value) / 1e8).toFixed(8)} BTC
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {tx.change_output && (
        <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--cs-yellow-dim)', border: '1px solid var(--cs-yellow)' }}>
          <p className="text-xs font-semibold font-display mb-1" style={{ color: 'var(--cs-yellow)' }}>
            Change Detection ({tx.change_output.confidence} confidence)
          </p>
          <ul className="text-xs space-y-0.5" style={{ color: 'var(--cs-yellow)', opacity: 0.8 }}>
            {tx.change_output.reasons.map((r, i) => (
              <li key={i}>&bull; {r}</li>
            ))}
          </ul>
          <p className="mt-1 font-mono" style={{ color: 'var(--cs-text-muted)', fontSize: '10px' }}>
            Heuristics: {tx.change_output.heuristics_used.join(', ')}
          </p>
        </div>
      )}
    </div>
  );
}

function EthLayout({
  tx,
  chain,
  onAddressClick,
}: {
  tx: NormalizedTx;
  chain: string;
  onAddressClick: (chain: string, address: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <DetailLabel>From</DetailLabel>
        {tx.from_address ? (
          <button
            onClick={() => onAddressClick(chain, tx.from_address!)}
            className="font-mono text-sm break-all hover:underline"
            style={{ color: 'var(--cs-accent)' }}
          >
            {tx.from_address}
          </button>
        ) : (
          <span style={{ color: 'var(--cs-text-muted)' }}>&mdash;</span>
        )}
      </div>

      <div>
        <DetailLabel>To</DetailLabel>
        {tx.to_address ? (
          <button
            onClick={() => onAddressClick(chain, tx.to_address!)}
            className="font-mono text-sm break-all hover:underline"
            style={{ color: 'var(--cs-accent)' }}
          >
            {tx.to_address}
          </button>
        ) : (
          <span style={{ color: 'var(--cs-text-muted)' }}>&mdash;</span>
        )}
      </div>

      <div>
        <DetailLabel>Type</DetailLabel>
        <p className="text-sm capitalize font-display" style={{ color: 'var(--cs-text-secondary)' }}>{tx.tx_type}</p>
      </div>
    </div>
  );
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-widest font-display mb-0.5" style={{ color: 'var(--cs-text-muted)' }}>{children}</p>
  );
}
