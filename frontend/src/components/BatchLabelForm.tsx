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
      <button
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-300 border border-gray-600"
      >
        Batch label addresses
      </button>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-600 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-white">Batch Label Addresses</h3>
        <button
          onClick={() => { setOpen(false); setStatus(null); }}
          className="text-gray-400 hover:text-white text-sm"
        >
          Close
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Entity name</label>
          <input
            type="text"
            placeholder="e.g. Binance"
            value={entityName}
            onChange={(e) => setEntityName(e.target.value)}
            className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Chain</label>
            <select
              value={chain}
              onChange={(e) => setChain(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-1 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {CHAINS.map((c) => (
                <option key={c} value={c}>{c.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Type</label>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-1 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Confidence</label>
            <select
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              className="w-full bg-gray-900 border border-gray-600 rounded px-1 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              {CONFIDENCE_LEVELS.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="mb-3">
        <label className="block text-xs text-gray-400 mb-1">
          Addresses (one per line, or separated by commas/spaces)
          {addressCount > 0 && (
            <span className="ml-2 text-blue-400">{addressCount} address{addressCount !== 1 ? 'es' : ''}</span>
          )}
        </label>
        <textarea
          value={addresses}
          onChange={(e) => setAddresses(e.target.value)}
          placeholder="Paste addresses here..."
          rows={6}
          className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white font-mono focus:outline-none focus:border-blue-500 resize-y"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSubmit}
          disabled={loading || addressCount === 0}
          className="text-sm px-4 py-1.5 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50"
        >
          {loading ? 'Saving...' : `Label ${addressCount} address${addressCount !== 1 ? 'es' : ''}`}
        </button>
        {status && (
          <span className={`text-sm ${status.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
