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
    <div className="fixed inset-y-0 right-0 w-full max-w-lg bg-gray-900 border-l border-gray-700 shadow-2xl z-50 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 bg-gray-900 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Transaction Detail</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white text-2xl leading-none"
        >
          &times;
        </button>
      </div>

      <div className="px-6 py-4 space-y-6">
        {/* Tx Hash */}
        <div>
          <Label>Tx Hash</Label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-300 break-all">{tx.tx_hash}</span>
            <button
              onClick={handleCopy}
              className="shrink-0 text-xs text-blue-400 hover:text-blue-300"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
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
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-900/50 text-green-400">
              Finalized
            </span>
          )}
          <span className="text-xs text-gray-500">
            Block #{tx.block.toLocaleString()}
          </span>
        </div>

        {/* Timestamp */}
        <div>
          <Label>Time</Label>
          <p className="text-gray-300 text-sm">{formatTimestamp(tx.timestamp)}</p>
        </div>

        {/* Method (ETH) */}
        {tx.method_name && (
          <div>
            <Label>Function</Label>
            <p className="text-yellow-300 font-mono text-sm">{tx.method_name}</p>
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
          <Label>Value</Label>
          <p className="text-white text-lg font-semibold">
            {formatValue(tx.value_human, tx.token)}
          </p>
          {tx.value_usd_at_time && (
            <p className="text-gray-400 text-sm">
              {formatUsd(tx.value_usd_at_time)} at time of transaction
            </p>
          )}
        </div>

        {/* Fee */}
        {tx.fee && tx.fee !== '0' && (
          <div>
            <Label>Fee</Label>
            <p className="text-gray-300 text-sm font-mono">
              {chain === 'eth'
                ? `${(Number(BigInt(tx.fee)) / 1e18).toFixed(8)} ETH`
                : `${(Number(BigInt(tx.fee)) / 1e8).toFixed(8)} BTC`}
            </p>
          </div>
        )}

        {/* Confirmations */}
        {tx.confirmations !== null && (
          <div>
            <Label>Confirmations</Label>
            <p className="text-gray-300 text-sm">
              {tx.confirmations.toLocaleString()}
              {' '}
              <span className="text-gray-500">
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
      <Label>Inputs &rarr; Outputs</Label>
      <div className="grid grid-cols-2 gap-4 mt-2">
        {/* Inputs */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase">Inputs</p>
          {tx.inputs?.map((inp, i) => (
            <div key={i} className="bg-gray-800 rounded p-2">
              <button
                onClick={() => inp.address && onAddressClick('btc', inp.address)}
                className="font-mono text-xs text-blue-400 hover:text-blue-300 break-all"
              >
                {truncateAddress(inp.address || '???')}
              </button>
              <p className="text-xs text-gray-400 mt-0.5">
                {(Number(inp.value) / 1e8).toFixed(8)} BTC
              </p>
            </div>
          ))}
        </div>

        {/* Outputs */}
        <div className="space-y-1">
          <p className="text-xs text-gray-500 uppercase">Outputs</p>
          {tx.outputs?.map((out, i) => {
            const isChange = tx.change_output?.output_index === i;
            return (
              <div
                key={i}
                className={`bg-gray-800 rounded p-2 ${isChange ? 'border border-yellow-600/50' : ''}`}
              >
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => out.address && onAddressClick('btc', out.address)}
                    className="font-mono text-xs text-blue-400 hover:text-blue-300 break-all"
                  >
                    {truncateAddress(out.address || '???')}
                  </button>
                  {isChange && (
                    <span className="text-[10px] bg-yellow-900/60 text-yellow-400 px-1 rounded">
                      CHANGE ({tx.change_output!.confidence})
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {(Number(out.value) / 1e8).toFixed(8)} BTC
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Change detection reasoning */}
      {tx.change_output && (
        <div className="mt-3 bg-yellow-900/20 border border-yellow-800/40 rounded p-3">
          <p className="text-xs text-yellow-400 font-medium mb-1">
            Change Detection ({tx.change_output.confidence} confidence)
          </p>
          <ul className="text-xs text-yellow-300/80 space-y-0.5">
            {tx.change_output.reasons.map((r, i) => (
              <li key={i}>&bull; {r}</li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-500 mt-1">
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
      {/* From */}
      <div>
        <Label>From</Label>
        {tx.from_address ? (
          <button
            onClick={() => onAddressClick(chain, tx.from_address!)}
            className="font-mono text-sm text-blue-400 hover:text-blue-300 break-all"
          >
            {tx.from_address}
          </button>
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </div>

      {/* To */}
      <div>
        <Label>To</Label>
        {tx.to_address ? (
          <button
            onClick={() => onAddressClick(chain, tx.to_address!)}
            className="font-mono text-sm text-blue-400 hover:text-blue-300 break-all"
          >
            {tx.to_address}
          </button>
        ) : (
          <span className="text-gray-500">—</span>
        )}
      </div>

      {/* Type */}
      <div>
        <Label>Type</Label>
        <p className="text-gray-300 text-sm capitalize">{tx.tx_type}</p>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-gray-500 text-xs uppercase tracking-wide mb-0.5">{children}</p>
  );
}
