import { useState } from 'react';
import { detectChain, isValidAddress } from '../utils/addressValidator';

interface AddressInputProps {
  onSubmit: (chain: string, address: string) => void;
  isLoading: boolean;
}

export function AddressInput({ onSubmit, isLoading }: AddressInputProps) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const trimmed = input.trim();
    if (!trimmed) {
      setError('Please enter an address');
      return;
    }

    if (!isValidAddress(trimmed)) {
      setError('Invalid address. Supported: BTC (1.../3.../bc1...) or ETH (0x...)');
      return;
    }

    const chain = detectChain(trimmed);
    if (!chain) {
      setError('Could not detect chain for this address');
      return;
    }

    setError(null);
    onSubmit(chain, trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Enter BTC or ETH address..."
          className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          disabled={isLoading}
        />
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading
            </>
          ) : (
            'Lookup'
          )}
        </button>
      </div>
      {error && <p className="mt-2 text-red-400 text-sm">{error}</p>}
    </div>
  );
}
