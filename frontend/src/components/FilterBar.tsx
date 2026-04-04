import { useFilterStore } from '../stores/filterStore';

interface FilterBarProps {
  spamCount: number;
  failedCount: number;
  dustCount: number;
}

export function FilterBar({ spamCount, failedCount, dustCount }: FilterBarProps) {
  const { showSpam, showFailed, showDust, setFilter } = useFilterStore();

  return (
    <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
      <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={showSpam}
          onChange={(e) => setFilter('showSpam', e.target.checked)}
          className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
        />
        Show spam ({spamCount})
      </label>
      <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={showFailed}
          onChange={(e) => setFilter('showFailed', e.target.checked)}
          className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
        />
        Show failed ({failedCount})
      </label>
      <label className="flex items-center gap-1.5 text-gray-400 cursor-pointer">
        <input
          type="checkbox"
          checked={showDust}
          onChange={(e) => setFilter('showDust', e.target.checked)}
          className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
        />
        Show dust ({dustCount})
      </label>
      <span className="text-gray-600 text-xs ml-auto">
        {spamCount + failedCount + dustCount} transactions hidden
      </span>
    </div>
  );
}
