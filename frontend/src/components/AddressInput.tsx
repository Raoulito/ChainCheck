import { useState } from 'react';
import { detectChain, isValidAddress, isEvmAddress, EVM_CHAINS } from '../utils/addressValidator';
import type { Chain } from '../utils/addressValidator';

interface AddressInputProps {
  onSubmit: (chain: string, address: string) => void;
  isLoading: boolean;
}

const CHAIN_LABELS: Record<string, string> = {
  eth: 'Ethereum',
  bsc: 'BNB Chain',
  polygon: 'Polygon',
};

export function AddressInput({ onSubmit, isLoading }: AddressInputProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [evmChain, setEvmChain] = useState<Chain>('eth');
  const [showChainSelect, setShowChainSelect] = useState(false);

  const handleInputChange = (value: string) => {
    setInput(value);
    setError(null);
    setShowChainSelect(isEvmAddress(value.trim()));
  };

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Please enter an address');
      return;
    }

    if (!isValidAddress(trimmed)) {
      setError('Invalid address. Supported: BTC (1.../3.../bc1...) or EVM (0x...)');
      return;
    }

    const detectedChain = detectChain(trimmed);
    if (!detectedChain) {
      setError('Could not detect chain for this address');
      return;
    }

    const chain = isEvmAddress(trimmed) ? evmChain : detectedChain;
    setError(null);
    onSubmit(chain, trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter BTC or EVM address..."
            className="cs-input w-full"
            style={{ paddingRight: '40px' }}
            disabled={isLoading}
          />
          {input && (
            <button
              onClick={() => { setInput(''); setError(null); setShowChainSelect(false); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs"
              style={{ color: 'var(--cs-text-muted)' }}
            >
              &times;
            </button>
          )}
        </div>

        {showChainSelect && (
          <select
            value={evmChain}
            onChange={(e) => setEvmChain(e.target.value as Chain)}
            className="cs-select"
            disabled={isLoading}
          >
            {EVM_CHAINS.map((c) => (
              <option key={c} value={c}>{CHAIN_LABELS[c] ?? c.toUpperCase()}</option>
            ))}
          </select>
        )}

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className={isLoading ? 'cs-btn-ghost' : 'cs-btn-primary'}
          style={{ minWidth: '100px' }}
        >
          {isLoading ? (
            <span className="flex items-center gap-2 justify-center">
              <span className="cs-live-dot" style={{ width: 6, height: 6 }} />
              Loading
            </span>
          ) : (
            'Lookup'
          )}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm font-display" style={{ color: 'var(--cs-red)' }}>{error}</p>
      )}
    </div>
  );
}
