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
  sanctioned: 'bg-red-500',
  mixer: 'bg-orange-500',
  darknet: 'bg-red-700',
  gambling: 'bg-yellow-500',
  exchange: 'bg-blue-500',
  defi: 'bg-purple-500',
  clean: 'bg-green-500',
};

export function ExposureChart({ data }: ExposureChartProps) {
  const entries = Object.entries(data.direct_exposure).filter(
    ([_, pct]) => parseFloat(pct) > 0
  );

  if (entries.length === 0) return null;

  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <p className="text-gray-400 text-xs uppercase tracking-wide mb-3">
        Direct Exposure
      </p>

      {/* Bar */}
      <div className="flex h-4 rounded-full overflow-hidden mb-3">
        {entries.map(([type, pct]) => {
          const width = parseFloat(pct);
          if (width <= 0) return null;
          return (
            <div
              key={type}
              className={`${TYPE_COLORS[type] ?? 'bg-gray-600'}`}
              style={{ width: `${width}%` }}
              title={`${type}: ${pct}`}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {entries.map(([type, pct]) => (
          <div key={type} className="flex items-center gap-1">
            <span className={`w-2.5 h-2.5 rounded-full ${TYPE_COLORS[type] ?? 'bg-gray-600'}`} />
            <span className="text-gray-300 capitalize">{type}</span>
            <span className="text-gray-500">{pct}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
