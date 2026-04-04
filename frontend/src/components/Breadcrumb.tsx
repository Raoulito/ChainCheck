import { useEffect } from 'react';
import { useTraceSession } from '../stores/traceSessionStore';
import { truncateAddress } from '../utils/formatters';

interface BreadcrumbProps {
  onNavigate: (chain: string, address: string) => void;
}

export function Breadcrumb({ onNavigate }: BreadcrumbProps) {
  const { history, currentIndex, back, forward } = useTraceSession();

  // Keyboard shortcuts: Alt+Left / Alt+Right
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault();
        back();
        const prev = history[currentIndex - 1];
        if (prev) onNavigate(prev.chain, prev.address);
      }
      if (e.altKey && e.key === 'ArrowRight' && currentIndex < history.length - 1) {
        e.preventDefault();
        forward();
        const next = history[currentIndex + 1];
        if (next) onNavigate(next.chain, next.address);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, history, back, forward, onNavigate]);

  if (history.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 mb-4 overflow-x-auto py-1">
      {/* Back / Forward buttons */}
      <button
        onClick={() => {
          if (currentIndex > 0) {
            back();
            const prev = history[currentIndex - 1];
            if (prev) onNavigate(prev.chain, prev.address);
          }
        }}
        disabled={currentIndex <= 0}
        className="px-2 py-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm"
        title="Back (Alt+Left)"
      >
        &larr;
      </button>
      <button
        onClick={() => {
          if (currentIndex < history.length - 1) {
            forward();
            const next = history[currentIndex + 1];
            if (next) onNavigate(next.chain, next.address);
          }
        }}
        disabled={currentIndex >= history.length - 1}
        className="px-2 py-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-sm"
        title="Forward (Alt+Right)"
      >
        &rarr;
      </button>

      <div className="flex items-center gap-1 ml-2 overflow-x-auto">
        {history.map((item, i) => (
          <span key={`${item.chain}-${item.address}-${i}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span className="text-gray-600">/</span>}
            <button
              onClick={() => {
                if (i !== currentIndex) {
                  // Navigate to this point in history
                  onNavigate(item.chain, item.address);
                }
              }}
              className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${
                i === currentIndex
                  ? 'bg-blue-900/50 text-blue-300 border border-blue-700/50'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
              }`}
            >
              <span className="uppercase text-[10px] mr-1 opacity-60">{item.chain}</span>
              {truncateAddress(item.address, 4)}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
