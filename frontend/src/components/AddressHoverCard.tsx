import { useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lookupAddress, batchLabels } from '../api/client';
import { truncateAddress } from '../utils/formatters';
import { EntityBadge } from './EntityBadge';
import { WebSearchButton } from './WebSearchButton';

interface AddressHoverCardProps {
  address: string;
  chain: string;
  children: React.ReactNode;
  onAddressClick: (chain: string, address: string) => void;
}

export function AddressHoverCard({
  address,
  chain,
  children,
  onAddressClick,
}: AddressHoverCardProps) {
  const [show, setShow] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['hover-stats', chain, address],
    queryFn: () => lookupAddress(chain, address, 1, 1),
    enabled: show,
    staleTime: 10 * 60 * 1000,
  });

  const { data: labelData } = useQuery({
    queryKey: ['hover-label', address],
    queryFn: () => batchLabels([address]),
    enabled: show,
    staleTime: 10 * 60 * 1000,
  });

  const label = labelData?.labels?.[address.toLowerCase()] ?? null;

  const handleEnter = () => {
    timeoutRef.current = setTimeout(() => setShow(true), 400);
  };

  const handleLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShow(false);
  };

  const token = chain === 'btc' ? 'BTC' : 'ETH';
  const decimals = chain === 'btc' ? 8 : 18;

  let balanceHuman = '\u2014';
  if (data?.stats) {
    const divisor = BigInt(10 ** decimals);
    const bal = BigInt(data.stats.balance);
    balanceHuman = `${parseFloat((Number(bal / divisor) + Number(bal % divisor) / Number(divisor)).toFixed(6))} ${token}`;
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
    >
      {children}
      {show && (
        <div
          className="absolute z-40 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 cs-card p-3 text-left"
          style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="text-xs uppercase px-1.5 py-0.5 rounded font-display font-semibold"
              style={{ background: 'var(--cs-bg-surface)', color: 'var(--cs-text-secondary)', fontSize: '10px' }}
            >
              {chain}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddressClick(chain, address);
              }}
              className="font-mono text-xs truncate hover:underline"
              style={{ color: 'var(--cs-accent)' }}
            >
              {truncateAddress(address, 8)}
            </button>
          </div>

          {label && (
            <div className="mb-2">
              <EntityBadge label={label} />
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              <div className="h-3 cs-skeleton w-3/4" />
              <div className="h-3 cs-skeleton w-1/2" />
            </div>
          ) : data ? (
            <div className="space-y-1 text-xs">
              <Row label="Balance" value={balanceHuman} />
              <Row label="Transactions" value={data.stats.tx_count.toLocaleString()} />
            </div>
          ) : null}

          {!label && !isLoading && (
            <div className="mt-2">
              <WebSearchButton address={address} chain={chain} />
            </div>
          )}

          {/* Arrow */}
          <div
            className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0"
            style={{
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '6px solid var(--cs-border)',
            }}
          />
        </div>
      )}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="font-display" style={{ color: 'var(--cs-text-muted)' }}>{label}</span>
      <span className="font-mono" style={{ color: 'var(--cs-text-primary)' }}>{value}</span>
    </div>
  );
}
