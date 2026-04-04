import type { LabelInfo } from '../types/api';

interface EntityBadgeProps {
  label: LabelInfo;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  exchange: { bg: 'bg-blue-900/50', text: 'text-blue-300' },
  mixer: { bg: 'bg-red-900/50', text: 'text-red-300' },
  sanctioned: { bg: 'bg-red-800/70', text: 'text-red-200' },
  defi: { bg: 'bg-purple-900/50', text: 'text-purple-300' },
  gambling: { bg: 'bg-orange-900/50', text: 'text-orange-300' },
  darknet: { bg: 'bg-red-900/70', text: 'text-red-200' },
  historical: { bg: 'bg-gray-700/50', text: 'text-gray-300' },
  mining: { bg: 'bg-green-900/50', text: 'text-green-300' },
};

export function EntityBadge({ label }: EntityBadgeProps) {
  const colors = TYPE_COLORS[label.entity_type] ?? { bg: 'bg-gray-700', text: 'text-gray-300' };

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${colors.bg} ${colors.text}`}
      title={`${label.entity_name} (${label.entity_type}) — Source: ${label.source}`}
    >
      {label.entity_type === 'sanctioned' && (
        <span className="text-red-400">&#9888;</span>
      )}
      {label.entity_name}
    </span>
  );
}
