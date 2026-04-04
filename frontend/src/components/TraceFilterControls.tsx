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
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mt-4 flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-2">
        <label className="text-xs text-gray-400">Min amount</label>
        <input
          type="text"
          value={minAmount}
          onChange={(e) => onMinAmountChange(e.target.value)}
          className="w-32 bg-gray-700 text-gray-200 text-xs rounded px-2 py-1 border border-gray-600"
          placeholder="0"
        />
      </div>

      {availableTokens.length > 1 && (
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-400">Token</label>
          <select
            value={tokenFilter}
            onChange={(e) => onTokenFilterChange(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs rounded px-2 py-1 border border-gray-600"
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
        className="ml-auto text-xs px-3 py-1 rounded bg-gray-700 text-gray-200 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Export CSV
      </button>
    </div>
  );
}
