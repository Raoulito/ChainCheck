import { useEffect } from 'react';
import { useTraceSession } from '../stores/traceSessionStore';
import { truncateAddress } from '../utils/formatters';

interface BreadcrumbProps {
  onNavigate: (chain: string, address: string) => void;
}

export function Breadcrumb({ onNavigate }: BreadcrumbProps) {
  const { history, currentIndex, back, forward } = useTraceSession();

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
    <div className="flex items-center gap-1 mb-4 overflow-x-auto py-2">
      <button
        onClick={() => {
          if (currentIndex > 0) {
            back();
            const prev = history[currentIndex - 1];
            if (prev) onNavigate(prev.chain, prev.address);
          }
        }}
        disabled={currentIndex <= 0}
        className="px-2 py-1 text-sm transition-colors"
        style={{ color: currentIndex <= 0 ? 'var(--cs-text-dim)' : 'var(--cs-text-secondary)' }}
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
        className="px-2 py-1 text-sm transition-colors"
        style={{ color: currentIndex >= history.length - 1 ? 'var(--cs-text-dim)' : 'var(--cs-text-secondary)' }}
        title="Forward (Alt+Right)"
      >
        &rarr;
      </button>

      <div className="flex items-center gap-1 ml-2 overflow-x-auto">
        {history.map((item, i) => (
          <span key={`${item.chain}-${item.address}-${i}`} className="flex items-center gap-1 shrink-0">
            {i > 0 && <span style={{ color: 'var(--cs-text-dim)' }}>/</span>}
            <button
              onClick={() => {
                if (i !== currentIndex) {
                  onNavigate(item.chain, item.address);
                }
              }}
              className="px-2 py-0.5 rounded-md text-xs font-mono transition-all"
              style={
                i === currentIndex
                  ? { background: 'var(--cs-accent-dim)', color: 'var(--cs-accent)', border: '1px solid var(--cs-border-glow)' }
                  : { color: 'var(--cs-text-muted)', border: '1px solid transparent' }
              }
              onMouseEnter={(e) => {
                if (i !== currentIndex) {
                  e.currentTarget.style.color = 'var(--cs-text-secondary)';
                  e.currentTarget.style.background = 'var(--cs-bg-hover)';
                }
              }}
              onMouseLeave={(e) => {
                if (i !== currentIndex) {
                  e.currentTarget.style.color = 'var(--cs-text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span className="uppercase mr-1" style={{ fontSize: '10px', opacity: 0.6 }}>{item.chain}</span>
              {truncateAddress(item.address, 4)}
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
