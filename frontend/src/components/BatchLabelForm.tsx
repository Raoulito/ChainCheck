import { useState } from 'react';
import { batchCreateLabels } from '../api/client';

const ENTITY_TYPES = [
  'exchange', 'defi', 'mixer', 'sanctioned', 'darknet',
  'gambling', 'scam', 'service', 'mining_pool', 'other',
];

const CHAINS = ['btc', 'eth', 'bsc', 'polygon'];
const CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

export function BatchLabelForm() {
  const [open, setOpen] = useState(false);
  const [addresses, setAddresses] = useState('');
  const [chain, setChain] = useState('btc');
  const [entityName, setEntityName] = useState('');
  const [entityType, setEntityType] = useState('exchange');
  const [confidence, setConfidence] = useState('high');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const parseAddresses = (): string[] => {
    return addresses
      .split(/[\n,\s]+/)
      .map((a) => a.trim())
      .filter((a) => a.length > 0);
  };

  const addressCount = parseAddresses().length;

  const handleSubmit = async () => {
    const parsed = parseAddresses();
    if (parsed.length === 0) {
      setStatus({ type: 'error', msg: 'Paste at least one address' });
      return;
    }
    if (!entityName.trim()) {
      setStatus({ type: 'error', msg: 'Entity name is required' });
      return;
    }
    if (parsed.length > 500) {
      setStatus({ type: 'error', msg: 'Maximum 500 addresses per batch' });
      return;
    }

    setLoading(true);
    setStatus(null);
    try {
      const result = await batchCreateLabels(parsed, chain, entityName.trim(), entityType, confidence);
      setStatus({
        type: 'success',
        msg: `Done: ${result.created} created, ${result.updated} updated (${result.total} total)`,
      });
      setAddresses('');
    } catch (err) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Batch label failed' });
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="cs-btn-ghost">
        Batch label addresses
      </button>
    );
  }

  return (
    <div className="cs-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold font-display" style={{ color: 'var(--cs-text-primary)' }}>Batch Label Addresses</h3>
        <button
          onClick={() => { setOpen(false); setStatus(null); }}
          className="text-sm font-display transition-colors"
          style={{ color: 'var(--cs-text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cs-text-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cs-text-muted)'}
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs font-display uppercase tracking-wider mb-1" style={{ color: 'var(--cs-text-muted)' }}>Entity name</label>
          <input
            type="text"
            placeholder="e.g. Binance"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            className="cs-input w-full"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs font-display uppercase tracking-wider mb-1" style={{ color: 'var(--cs-text-muted)' }}>Chain</label>
            <select value={chain} onChange={(e) => setChain(e.target.value)} className="cs-select w-full">
              {CHAINS.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-display uppercase tracking-wider mb-1" style={{ color: 'var(--cs-text-muted)' }}>Type</label>
            <select value={entityType} onChange={(e) => setEntityType(e.target.value)} className="cs-select w-full">
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-display uppercase tracking-wider mb-1" style={{ color: 'var(--cs-text-muted)' }}>Confidence</label>
            <select value={confidence} onChange={(e) => setConfidence(e.target.value)} className="cs-select w-full">
              {CONFIDENCE_LEVELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs font-display uppercase tracking-wider mb-1" style={{ color: 'var(--cs-text-muted)' }}>
          Addresses (one per line, or separated by commas/spaces)
          {addressCount > 0 && (
            <span className="ml-2 font-mono normal-case" style={{ color: 'var(--cs-accent)' }}>{addressCount} address{addressCount !== 1 ? 'es' : ''}</span>
          )}
        </label>
        <textarea
          value={addresses}
          onChange={(e) => setAddresses(e.target.value)}
          placeholder="Paste addresses here..."
          rows={6}
          className="cs-input w-full resize-y"
          style={{ fontSize: '12px' }}
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading || addressCount === 0}
          className="cs-btn-primary"
          style={{ padding: '8px 18px', fontSize: '13px' }}
        >
          {loading ? 'Saving...' : `Label ${addressCount} address${addressCount !== 1 ? 'es' : ''}`}
        </button>
        {status && (
          <span className="text-sm font-display" style={{ color: status.type === 'success' ? 'var(--cs-green)' : 'var(--cs-red)' }}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
