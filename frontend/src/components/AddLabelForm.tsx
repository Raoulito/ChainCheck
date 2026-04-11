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
      {existing && (
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-display"
          style={{ background: 'var(--cs-blue-dim)', color: 'var(--cs-blue)', border: '1px solid var(--cs-blue)' }}
        >
          {existing.entity_name} ({existing.entity_type})
          <span style={{ opacity: 0.5 }} className="ml-1 font-mono">{existing.source}</span>
        </span>
      )}

      <button
        onClick={() => { setOpen(!open); setStatus(null); }}
        className="cs-btn-ghost"
        style={{ padding: '2px 10px', fontSize: '11px' }}
        title={existing ? 'Edit label' : 'Add label'}
      >
        {existing ? 'Edit label' : '+ Label'}
      </button>

      {!open && status && (
        <span className="text-xs font-display" style={{ color: status.type === 'success' ? 'var(--cs-green)' : 'var(--cs-red)' }}>
          {status.msg}
        </span>
      )}

      {open && (
        <div className="flex items-center gap-2 ml-1">
          <input
            type="text"
            placeholder="Entity name"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            className="cs-input"
            style={{ width: '150px', padding: '4px 8px', fontSize: '11px' }}
          />
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            className="cs-select"
            style={{ padding: '4px 8px', fontSize: '11px' }}
          >
            {ENTITY_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <select
            value={confidence}
            onChange={(e) => setConfidence(e.target.value)}
            className="cs-select"
            style={{ padding: '4px 8px', fontSize: '11px' }}
          >
            {CONFIDENCE_LEVELS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="cs-btn-primary"
            style={{ padding: '4px 12px', fontSize: '11px' }}
          >
            {loading ? '...' : 'Save'}
          </button>
          <button
            onClick={() => setOpen(false)}
            className="text-xs font-display"
            style={{ color: 'var(--cs-text-muted)' }}
          >
            Cancel
          </button>
          {status && (
            <span className="text-xs font-display" style={{ color: status.type === 'success' ? 'var(--cs-green)' : 'var(--cs-red)' }}>
              {status.msg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
