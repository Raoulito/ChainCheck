interface TraceFilterControlsProps {
  minAmount: string;
  onMinAmountChange: (val: string) => void;
  tokenFilter: string;
  onTokenFilterChange: (val: string) => void;
  availableTokens: string[];
  onExport: () => void;
  hasData: boolean;
}

export function TraceFilterControls({
  minAmount,
  onMinAmountChange,
  tokenFilter,
  onTokenFilterChange,
  availableTokens,
  onExport,
  hasData,
}: TraceFilterControlsProps) {
  return (
    <div className="cs-card p-3 mt-4 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-xs font-display uppercase tracking-wider" style={{ color: 'var(--cs-text-muted)' }}>Min amount</label>
        <input
          type="text"
          value={minAmount}
          onChange={(e) => onMinAmountChange(e.target.value)}
          className="cs-input"
          style={{ width: '120px', padding: '6px 10px', fontSize: '12px' }}
          placeholder="0"
        />
      </div>

      {availableTokens.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-display uppercase tracking-wider" style={{ color: 'var(--cs-text-muted)' }}>Token</label>
          <select
            value={tokenFilter}
            onChange={(e) => onTokenFilterChange(e.target.value)}
            className="cs-select"
            style={{ padding: '6px 10px', fontSize: '12px' }}
          >
            <option value="">All tokens</option>
            {availableTokens.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      )}

      <button
        onClick={onExport}
        disabled={!hasData}
        className="cs-btn-ghost ml-auto"
      >
        Export CSV
      </button>
    </div>
  );
}
