interface ExposureData {
  direct_exposure: Record<string, string>;
  indirect_exposure: Record<string, string>;
  total_volume_analyzed: string;
  hops_analyzed: number;
}

interface ExposureChartProps {
  data: ExposureData;
}

const TYPE_COLORS: Record<string, string> = {
  sanctioned: 'var(--cs-red)',
  mixer: 'var(--cs-orange)',
  darknet: '#cc2244',
  gambling: 'var(--cs-yellow)',
  exchange: 'var(--cs-blue)',
  defi: 'var(--cs-purple)',
  clean: 'var(--cs-green)',
};

export function ExposureChart({ data }: ExposureChartProps) {
  const entries = Object.entries(data.direct_exposure).filter(
    ([_, pct]) => parseFloat(pct) > 0
  );

  if (entries.length === 0) return null;

  return (
    <div className="cs-card p-4">
      <p className="text-xs uppercase tracking-widest font-display mb-3" style={{ color: 'var(--cs-text-muted)' }}>
        Direct Exposure
      </p>

      {/* Bar */}
      <div className="flex h-3 rounded-full overflow-hidden mb-4" style={{ background: 'var(--cs-bg-base)' }}>
        {entries.map(([type, pct]) => {
          const width = parseFloat(pct);
          if (width <= 0) return null;
          return (
            <div
              key={type}
              style={{ width: `${width}%`, background: TYPE_COLORS[type] ?? 'var(--cs-text-muted)' }}
              title={`${type}: ${pct}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs font-display">
        {entries.map(([type, pct]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: TYPE_COLORS[type] ?? 'var(--cs-text-muted)' }} />
            <span className="capitalize" style={{ color: 'var(--cs-text-secondary)' }}>{type}</span>
            <span style={{ color: 'var(--cs-text-muted)' }}>{pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
