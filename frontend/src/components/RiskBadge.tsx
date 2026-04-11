import { useState } from 'react';
import type { RiskScore } from '../types/api';

interface RiskBadgeProps {
  risk: RiskScore;
}

const SCORE_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  SEVERE: { color: 'var(--cs-red)', bg: 'var(--cs-red-dim)', border: 'var(--cs-red)' },
  HIGH: { color: 'var(--cs-orange)', bg: 'var(--cs-orange-dim)', border: 'var(--cs-orange)' },
  MEDIUM: { color: 'var(--cs-yellow)', bg: 'var(--cs-yellow-dim)', border: 'var(--cs-yellow)' },
  LOW: { color: 'var(--cs-green)', bg: 'var(--cs-green-dim)', border: 'var(--cs-green)' },
};

export function RiskBadge({ risk }: RiskBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const style = SCORE_STYLES[risk.score] ?? SCORE_STYLES.LOW;

  return (
    <div className="inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold font-display transition-all"
        style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
      >
        {risk.score === 'SEVERE' && <span>&#9888;</span>}
        Risk: {risk.score}
        {risk.reasons.length > 0 && (
          <span style={{ opacity: 0.6 }} className="ml-1">{expanded ? '\u25B2' : '\u25BC'}</span>
        )}
      </button>

      {expanded && risk.reasons.length > 0 && (
        <div className="mt-2 rounded-lg p-3 text-xs" style={{ background: style.bg, border: `1px solid ${style.border}` }}>
          <ul className="space-y-1.5">
            {risk.reasons.map((r, i) => (
              <li key={i} className="font-display" style={{ color: style.color }}>
                <span className="font-semibold">[{r.severity}]</span> {r.rule}: {r.detail}
              </li>
            ))}
          </ul>
          {risk.stale && (
            <p className="mt-2 font-display" style={{ color: 'var(--cs-text-muted)', fontSize: '10px' }}>Score may be stale</p>
          )}
        </div>
      )}
    </div>
  );
}
