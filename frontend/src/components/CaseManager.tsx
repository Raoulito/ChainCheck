import { useState, useEffect } from 'react';
import type { InvestigationSummary } from '../types/api';
import {
  listInvestigations,
  createInvestigation,
  deleteInvestigation,
  isAuthenticated,
  login,
  register,
  logout,
} from '../api/auth';
import { truncateAddress, formatTimestamp } from '../utils/formatters';

interface CaseManagerProps {
  onOpenInvestigation: (id: string, address: string, chain: string) => void;
}

export function CaseManager({ onOpenInvestigation }: CaseManagerProps) {
  const [authed, setAuthed] = useState(isAuthenticated());
  const [investigations, setInvestigations] = useState<InvestigationSummary[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Auth form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newChain, setNewChain] = useState('eth');

  const loadInvestigations = async () => {
    try {
      const list = await listInvestigations();
      setInvestigations(list);
    } catch {
      setInvestigations([]);
    }
  };

  useEffect(() => {
    if (authed) loadInvestigations();
  }, [authed]);

  const handleAuth = async () => {
    setAuthError(null);
    try {
      if (authMode === 'login') {
        await login(email, password);
      } else {
        await register(email, password, displayName);
      }
      setAuthed(true);
      setEmail('');
      setPassword('');
      setDisplayName('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Auth failed');
    }
  };

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

  const handleLogout = () => {
    logout();
    setAuthed(false);
    setInvestigations([]);
  };

  // Auth form
  if (!authed) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 max-w-md mx-auto mt-8">
        <h2 className="text-lg font-medium text-gray-200 mb-4">
          {authMode === 'login' ? 'Sign In' : 'Create Account'}
        </h2>

        <div className="space-y-3">
          {authMode === 'register' && (
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="w-full bg-gray-700 text-gray-200 text-sm rounded px-3 py-2 border border-gray-600"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="w-full bg-gray-700 text-gray-200 text-sm rounded px-3 py-2 border border-gray-600"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full bg-gray-700 text-gray-200 text-sm rounded px-3 py-2 border border-gray-600"
            onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
          />

          {authError && <p className="text-red-400 text-xs">{authError}</p>}

          <button
            onClick={handleAuth}
            className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded font-medium"
          >
            {authMode === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          <button
            onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}
            className="w-full text-xs text-gray-400 hover:text-gray-200"
          >
            {authMode === 'login' ? 'Need an account? Register' : 'Already have an account? Sign in'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-gray-200">Investigations</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            New Investigation
          </button>
          <button
            onClick={handleLogout}
            className="text-xs px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
          >
            Sign Out
          </button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 p-3 bg-gray-700/50 rounded space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Investigation title"
            className="w-full bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600"
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Root address"
              className="flex-1 bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600 font-mono"
            />
            <select
              value={newChain}
              onChange={(e) => setNewChain(e.target.value)}
              className="bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600"
            >
              <option value="eth">ETH</option>
              <option value="btc">BTC</option>
              <option value="bsc">BSC</option>
              <option value="polygon">Polygon</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            className="text-xs px-3 py-1 rounded bg-green-700 text-white hover:bg-green-600"
          >
            Create
          </button>
        </div>
      )}

      {/* Investigation list */}
      {investigations.length === 0 ? (
        <p className="text-gray-500 text-xs text-center py-4">No investigations yet</p>
      ) : (
        <div className="space-y-1">
          {investigations.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center justify-between py-2 px-3 hover:bg-gray-700/50 rounded cursor-pointer"
              onClick={() => onOpenInvestigation(inv.id, inv.root_address, inv.root_chain)}
            >
              <div>
                <p className="text-sm text-gray-200">{inv.title}</p>
                <p className="text-xs text-gray-500">
                  {inv.root_chain.toUpperCase()} {truncateAddress(inv.root_address, 6)}
                  {' '}&middot;{' '}v{inv.version}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">
                  {new Date(inv.updated_at).toLocaleDateString()}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(inv.id); }}
                  className="text-xs text-red-400 hover:text-red-300 px-1"
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
