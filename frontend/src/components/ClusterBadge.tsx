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
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-700"
      >
        Cluster ({cluster.address_count} addrs)
        <span className="opacity-60">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {cluster.label && (
        <span className="ml-1 text-xs text-gray-400">
          &rarr; {cluster.label.entity_name}
        </span>
      )}

      {expanded && (
        <div className="mt-1 bg-gray-800 border border-indigo-800 rounded p-2 max-h-40 overflow-y-auto">
          {cluster.addresses.slice(0, 20).map((addr) => (
            <button
              key={addr}
              onClick={() => onAddressClick('btc', addr)}
              className="block font-mono text-xs text-blue-400 hover:text-blue-300 py-0.5"
            >
              {truncateAddress(addr, 10)}
            </button>
          ))}
          {cluster.address_count > 20 && (
            <p className="text-xs text-gray-500 mt-1">
              ...and {cluster.address_count - 20} more
            </p>
          )}
        </div>
      )}
    </div>
  );
}
