import { useFilterStore } from '../stores/filterStore';

interface FilterBarProps {
  spamCount: number;
  failedCount: number;
  dustCount: number;
}

export function FilterBar({ spamCount, failedCount, dustCount }: FilterBarProps) {
  const { showSpam, showFailed, showDust, setFilter } = useFilterStore();

  return (
    <div className="flex flex-wrap items-center gap-5 mb-4 text-sm font-display">
      <FilterToggle
        label={`Show spam (${spamCount})`}
        checked={showSpam}
        onChange={(v) => setFilter('showSpam', v)}
      />
      <FilterToggle
        label={`Show failed (${failedCount})`}
        checked={showFailed}
        onChange={(v) => setFilter('showFailed', v)}
      />
      <FilterToggle
        label={`Show dust (${dustCount})`}
        checked={showDust}
        onChange={(v) => setFilter('showDust', v)}
      />
      <span className="text-xs ml-auto font-mono" style={{ color: 'var(--cs-text-dim)' }}>
        {spamCount + failedCount + dustCount} hidden
      </span>
    </div>
  );
}

function FilterToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none group">
      <div
        className="w-4 h-4 rounded flex items-center justify-center transition-all"
        style={{
          background: checked ? 'var(--cs-accent)' : 'var(--cs-bg-base)',
          border: `1px solid ${checked ? 'var(--cs-accent)' : 'var(--cs-border)'}`,
        }}
        onClick={() => onChange(!checked)}
      >
        {checked && (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="var(--cs-bg-deep)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" />
      <span className="text-xs transition-colors" style={{ color: 'var(--cs-text-secondary)' }}>{label}</span>
    </label>
  );
}
