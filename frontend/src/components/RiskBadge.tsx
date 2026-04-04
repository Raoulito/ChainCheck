import { useState } from 'react';
import type { RiskScore } from '../types/api';

interface RiskBadgeProps {
  risk: RiskScore;
}

const SCORE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  SEVERE: { bg: 'bg-red-900/70', text: 'text-red-200', border: 'border-red-600' },
  HIGH: { bg: 'bg-orange-900/60', text: 'text-orange-200', border: 'border-orange-600' },
  MEDIUM: { bg: 'bg-yellow-900/50', text: 'text-yellow-200', border: 'border-yellow-600' },
  LOW: { bg: 'bg-green-900/40', text: 'text-green-300', border: 'border-green-700' },
};

export function RiskBadge({ risk }: RiskBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const colors = SCORE_COLORS[risk.score] ?? SCORE_COLORS.LOW;

  return (
    <div className="inline-block">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}
      >
        {risk.score === 'SEVERE' && <span>&#9888;</span>}
        Risk: {risk.score}
        {risk.reasons.length > 0 && (
          <span className="opacity-60 ml-0.5">{expanded ? '\u25B2' : '\u25BC'}</span>
        )}
      </button>

      {expanded && risk.reasons.length > 0 && (
        <div className={`mt-1 rounded border p-2 text-xs ${colors.bg} ${colors.border}`}>
          <ul className="space-y-1">
            {risk.reasons.map((r, i) => (
              <li key={i} className={colors.text}>
                <span className="font-medium">[{r.severity}]</span> {r.rule}: {r.detail}
              </li>
            ))}
          </ul>
          {risk.stale && (
            <p className="text-gray-400 mt-1 text-[10px]">Score may be stale</p>
          )}
        </div>
      )}
    </div>
  );
}
