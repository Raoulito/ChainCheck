import type { LabelInfo } from '../types/api';

interface EntityBadgeProps {
  label: LabelInfo;
}

const TYPE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  exchange: { bg: 'var(--cs-blue-dim)', color: 'var(--cs-blue)', border: 'var(--cs-blue)' },
  mixer: { bg: 'var(--cs-red-dim)', color: 'var(--cs-red)', border: 'var(--cs-red)' },
  sanctioned: { bg: 'var(--cs-red-dim)', color: 'var(--cs-red)', border: 'var(--cs-red)' },
  defi: { bg: 'var(--cs-purple-dim)', color: 'var(--cs-purple)', border: 'var(--cs-purple)' },
  gambling: { bg: 'var(--cs-orange-dim)', color: 'var(--cs-orange)', border: 'var(--cs-orange)' },
  darknet: { bg: 'var(--cs-red-dim)', color: 'var(--cs-red)', border: 'var(--cs-red)' },
  historical: { bg: 'var(--cs-bg-surface)', color: 'var(--cs-text-secondary)', border: 'var(--cs-border)' },
  mining: { bg: 'var(--cs-green-dim)', color: 'var(--cs-green)', border: 'var(--cs-green)' },
};

export function EntityBadge({ label }: EntityBadgeProps) {
  const style = TYPE_STYLES[label.entity_type] ?? { bg: 'var(--cs-bg-surface)', color: 'var(--cs-text-secondary)', border: 'var(--cs-border)' };

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-display"
      style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
      title={`${label.entity_name} (${label.entity_type}) — Source: ${label.source}`}
    >
      {label.entity_type === 'sanctioned' && (
        <span style={{ color: 'var(--cs-red)' }}>&#9888;</span>
      )}
      {label.entity_name}
    </span>
  );
}
