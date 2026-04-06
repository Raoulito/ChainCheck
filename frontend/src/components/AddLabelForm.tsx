import { useState, useEffect } from 'react';
import { createLabel, getLabel } from '../api/client';
import type { LabelInfo } from '../types/api';

const ENTITY_TYPES = [
  'exchange', 'defi', 'mixer', 'sanctioned', 'darknet',
  'gambling', 'scam', 'service', 'mining_pool', 'other',
];

const CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

interface AddLabelFormProps {
  address: string;
  chain: string;
}

export function AddLabelForm({ address, chain }: AddLabelFormProps) {
  const [open, setOpen] = useState(false);
  const [existing, setExisting] = useState<LabelInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [entityName, setEntityName] = useState('');
  const [entityType, setEntityType] = useState('exchange');
  const [confidence, setConfidence] = useState('medium');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Fetch existing label when address changes
  useEffect(() => {
    let cancelled = false;
    setExisting(null);
    setStatus(null);
    getLabel(address)
      .then((label) => { if (!cancelled) setExisting(label); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [address]);

  const handleSubmit = async () => {
    if (!entityName.trim()) {
      setStatus({ type: 'error', msg: 'Entity name is required' });
      return;
    }
    setLoading(true);
    setStatus(null);
    try {
      const label = await createLabel(address, chain, entityName.trim(), entityType, confidence);
      setExisting(label);
      setStatus({ type: 'success', msg: 'Label saved' });
      setOpen(false);
    } catch (err) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to save label' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      {/* Existing label display */}
      {existing && (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-blue-900/50 text-blue-300 border border-blue-700">
          {existing.entity_name} ({existing.entity_type})
          <span className="opacity-50 ml-1">{existing.source}</span>
        </span>
      )}

      {/* Toggle button */}
      <button
        onClick={() => { setOpen(!open); setStatus(null); }}
        className="text-xs px-2 py-0.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600"
        title={existing ? 'Edit label' : 'Add label'}
      >
        {existing ? 'Edit label' : '+ Label'}
      </button>

      {/* Status message (shown inline when form is closed) */}
      {!open && status && (
        <span className={`text-xs ${status.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
          {status.msg}
        </span>
      )}

      {/* Inline form */}
      {open && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="text"
            placeholder="Entity name"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-2 py-0.5 text-xs text-white w-40 focus:outline-none focus:border-blue-500"
          />
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="text-xs px-2 py-0.5 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50"
          >
            {loading ? '...' : 'Save'}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-xs px-1 py-0.5 text-gray-400 hover:text-white"
          >
            Cancel
          </button>
          {status && (
            <span className={`text-xs ${status.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
              {status.msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
