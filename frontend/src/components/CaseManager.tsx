import { useState, useEffect } from 'react';
import type { InvestigationSummary } from '../types/api';
import {
  listInvestigations,
  createInvestigation,
  deleteInvestigation,
} from '../api/auth';
import { truncateAddress } from '../utils/formatters';

interface CaseManagerProps {
  onOpenInvestigation: (id: string, address: string, chain: string) => void;
}

export function CaseManager({ onOpenInvestigation }: CaseManagerProps) {
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newChain, setNewChain] = useState('eth');

  useEffect(() => {
    listInvestigations().then(setInvestigations).catch(() => setInvestigations([]));
  }, []);

  const handleCreate = async () => {
    if (!newTitle || !newAddress) return;
    try {
      const inv = await createInvestigation(newTitle, newAddress, newChain);
      setShowCreate(false);
      setNewTitle('');
      setNewAddress('');
      setInvestigations([inv, ...investigations]);
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    await deleteInvestigation(id);
    setInvestigations(investigations.filter(i => i.id !== id));
  };

  return (
    <div className="cs-card p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold font-display" style={{ color: 'var(--cs-text-primary)' }}>Investigations</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="cs-btn-primary"
          style={{ padding: '6px 14px', fontSize: '12px' }}
        >
          New Investigation
        </button>
      </div>

      {showCreate && (
        <div className="mb-4 p-3 rounded-lg space-y-2" style={{ background: 'var(--cs-bg-surface)' }}>
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Investigation title"
            className="cs-input w-full"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Root address"
              className="cs-input flex-1"
            />
            <select
              value={newChain}
              onChange={(e) => setNewChain(e.target.value)}
              className="cs-select"
            >
              <option value="eth">ETH</option>
              <option value="btc">BTC</option>
              <option value="bsc">BSC</option>
              <option value="polygon">Polygon</option>
            </select>
          </div>
          <button onClick={handleCreate} className="cs-btn-primary" style={{ padding: '6px 14px', fontSize: '12px', background: 'linear-gradient(135deg, var(--cs-green), #00b894)' }}>
            Create
          </button>
        </div>
      )}

      {investigations.length === 0 ? (
        <p className="text-xs font-display text-center py-4" style={{ color: 'var(--cs-text-muted)' }}>No investigations yet</p>
      ) : (
        <div className="space-y-1">
          {investigations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between py-2.5 px-3 rounded-lg cursor-pointer transition-colors"
              style={{ border: '1px solid transparent' }}
              onClick={() => onOpenInvestigation(inv.id, inv.root_address, inv.root_chain)}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--cs-bg-hover)';
                e.currentTarget.style.borderColor = 'var(--cs-border)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
                e.currentTarget.style.borderColor = 'transparent';
              }}
            >
              <div>
                <p className="text-sm font-display" style={{ color: 'var(--cs-text-primary)' }}>{inv.title}</p>
                <p className="text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
                  {inv.root_chain.toUpperCase()} {truncateAddress(inv.root_address, 6)}
                  {' '}&middot;{' '}v{inv.version}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
                  {new Date(inv.updated_at).toLocaleDateString()}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(inv.id); }}
                  className="text-xs font-display transition-colors"
                  style={{ color: 'var(--cs-red)', opacity: 0.6 }}
                  onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                  onMouseLeave={(e) => e.currentTarget.style.opacity = '0.6'}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
