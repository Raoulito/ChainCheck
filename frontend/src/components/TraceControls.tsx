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
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={isTracing ? onCancel : handleStart}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              isTracing
                ? 'bg-red-700 hover:bg-red-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isTracing ? 'Cancel Trace' : 'Start Trace'}
          </button>

          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as 'forward' | 'backward')}
            className="bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600"
            disabled={isTracing}
          >
            <option value="forward">Forward (follow outflows)</option>
            <option value="backward">Backward (follow inflows)</option>
          </select>

          <select
            value={maxHops}
            onChange={(e) => setMaxHops(Number(e.target.value))}
            className="bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600"
            disabled={isTracing}
          >
            {[1, 2, 3, 4, 5].map((h) => (
              <option key={h} value={h}>{h} hop{h > 1 ? 's' : ''}</option>
            ))}
          </select>
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-gray-400 hover:text-gray-200"
        >
          {expanded ? 'Less options' : 'More options'}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Min value (raw units)</label>
            <input
              type="text"
              value={minValue}
              onChange={(e) => setMinValue(e.target.value)}
              className="w-full bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600"
              disabled={isTracing}
            />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Max txs per node</label>
            <input
              type="number"
              value={maxTxsPerNode}
              onChange={(e) => setMaxTxsPerNode(Number(e.target.value))}
              className="w-full bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600"
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
