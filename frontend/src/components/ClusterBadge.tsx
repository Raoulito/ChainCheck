import { useState } from 'react';
import { truncateAddress } from '../utils/formatters';

interface ClusterData {
  cluster_id: string | null;
  addresses: string[];
  address_count: number;
  label: {
    entity_name: string;
    entity_type: string;
    from_address: string;
  } | null;
}

interface ClusterBadgeProps {
  cluster: ClusterData;
  onAddressClick: (chain: string, address: string) => void;
}

export function ClusterBadge({ cluster, onAddressClick }: ClusterBadgeProps) {
  const [expanded, setExpanded] = useState(false);

  if (!cluster.cluster_id || cluster.address_count < 2) return null;

  return (
    <div className="inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-display"
        style={{ background: 'var(--cs-purple-dim)', color: 'var(--cs-purple)', border: '1px solid var(--cs-purple)' }}
      >
        Cluster ({cluster.address_count} addrs)
        <span style={{ opacity: 0.6 }}>{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {cluster.label && (
        <span className="ml-1 text-xs font-display" style={{ color: 'var(--cs-text-muted)' }}>
          &rarr; {cluster.label.entity_name}
        </span>
      )}

      {expanded && (
        <div className="mt-1 cs-card-surface p-2 max-h-40 overflow-y-auto" style={{ borderColor: 'var(--cs-purple)' }}>
          {cluster.addresses.slice(0, 20).map((addr) => (
            <button
              key={addr}
              onClick={() => onAddressClick('btc', addr)}
              className="block font-mono text-xs py-0.5 hover:underline"
              style={{ color: 'var(--cs-accent)' }}
            >
              {truncateAddress(addr, 10)}
            </button>
          ))}
          {cluster.address_count > 20 && (
            <p className="text-xs mt-1 font-display" style={{ color: 'var(--cs-text-muted)' }}>
              ...and {cluster.address_count - 20} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
