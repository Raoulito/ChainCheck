import { useState } from 'react';
import type { TraceRequest } from '../types/api';

interface TraceControlsProps {
  address: string;
  chain: string;
  onStartTrace: (params: TraceRequest) => void;
  isTracing: boolean;
  onCancel: () => void;
}

export function TraceControls({
  address,
  chain,
  onStartTrace,
  isTracing,
  onCancel,
}: TraceControlsProps) {
  const [direction, setDirection] = useState<'forward' | 'backward'>('forward');
  const [maxHops, setMaxHops] = useState(3);
  const [minValue, setMinValue] = useState('0');
  const [maxTxsPerNode, setMaxTxsPerNode] = useState(50);
  const [expanded, setExpanded] = useState(false);

  const handleStart = () => {
    onStartTrace({
      address,
      chain,
      direction,
      max_hops: maxHops,
      min_value: minValue,
      trace_through_entities: false,
      entity_pruning_list: [],
      max_txs_per_node: maxTxsPerNode,
    });
  };

  return (
    <div className="cs-card p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={isTracing ? onCancel : handleStart}
            className={isTracing ? 'cs-btn-danger' : 'cs-btn-primary'}
            style={{ padding: '8px 20px', fontSize: '13px' }}
          >
            {isTracing ? 'Cancel Trace' : 'Start Trace'}
          </button>

          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'forward' | 'backward')}
            className="cs-select"
            disabled={isTracing}
          >
            <option value="forward">Forward (follow outflows)</option>
            <option value="backward">Backward (follow inflows)</option>
          </select>

          <select
            value={maxHops}
            onChange={(e) => setMaxHops(Number(e.target.value))}
            className="cs-select"
            disabled={isTracing}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15].map((h) => (
              <option key={h} value={h}>{h} hop{h > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs font-display transition-colors"
          style={{ color: 'var(--cs-text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cs-text-secondary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cs-text-muted)'}
        >
          {expanded ? 'Less options' : 'More options'}
        </button>
      </div>

      {expanded && (
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-display mb-1 block" style={{ color: 'var(--cs-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Min value (raw units)</label>
            <input
              type="text"
              value={minValue}
              onChange={(e) => setMinValue(e.target.value)}
              className="cs-input w-full"
              disabled={isTracing}
            />
          </div>
          <div>
            <label className="text-xs font-display mb-1 block" style={{ color: 'var(--cs-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Max txs per node</label>
            <input
              type="number"
              value={maxTxsPerNode}
              onChange={(e) => setMaxTxsPerNode(Number(e.target.value))}
              className="cs-input w-full"
              disabled={isTracing}
              min={1}
              max={100}
            />
          </div>
        </div>
      )}
    </div>
  );
}
