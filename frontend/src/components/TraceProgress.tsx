interface TraceProgressProps {
  progress: {
    nodes: number;
    edges: number;
    hop: number;
    maxHops: number;
    apiCalls: number;
    apiCallsLimit: number;
  } | null;
  status: string;
  metadata: {
    total_nodes: number;
    total_edges: number;
    trace_time_ms: number;
    pruned_at: { address: string; reason: string; hop: number }[];
  } | null;
}

export function TraceProgress({ progress, status, metadata }: TraceProgressProps) {
  if (!progress && status === 'idle') return null;

  const apiPct = progress
    ? Math.min(100, (progress.apiCalls / progress.apiCallsLimit) * 100)
    : 0;

  return (
    <div className="cs-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold font-display" style={{ color: 'var(--cs-text-primary)' }}>
          {status === 'streaming' && (
            <span className="flex items-center gap-2">
              <span className="cs-live-dot" />
              Tracing hop {progress?.hop ?? 0} of {progress?.maxHops ?? '?'}...
            </span>
          )}
          {status === 'completed' && <span style={{ color: 'var(--cs-green)' }}>Trace complete</span>}
          {status === 'failed' && <span style={{ color: 'var(--cs-red)' }}>Trace failed</span>}
          {status === 'cancelled' && <span style={{ color: 'var(--cs-yellow)' }}>Trace cancelled</span>}
        </p>
        {metadata && (
          <span className="text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
            {(metadata.trace_time_ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <span className="font-display uppercase tracking-wider" style={{ color: 'var(--cs-text-muted)', fontSize: '10px' }}>Addresses</span>
          <p className="font-mono font-semibold mt-0.5" style={{ color: 'var(--cs-text-primary)' }}>{progress?.nodes ?? 0}</p>
        </div>
        <div>
          <span className="font-display uppercase tracking-wider" style={{ color: 'var(--cs-text-muted)', fontSize: '10px' }}>Edges</span>
          <p className="font-mono font-semibold mt-0.5" style={{ color: 'var(--cs-text-primary)' }}>{progress?.edges ?? 0}</p>
        </div>
        <div>
          <span className="font-display uppercase tracking-wider" style={{ color: 'var(--cs-text-muted)', fontSize: '10px' }}>API calls</span>
          <p className="font-mono font-semibold mt-0.5" style={{ color: 'var(--cs-text-primary)' }}>
            {progress?.apiCalls ?? 0}/{progress?.apiCallsLimit ?? 200}
          </p>
        </div>
      </div>

      {/* API budget bar */}
      <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--cs-bg-base)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${apiPct}%`,
            background: apiPct > 80
              ? `linear-gradient(90deg, var(--cs-orange), var(--cs-red))`
              : `linear-gradient(90deg, var(--cs-accent), var(--cs-accent-bright))`,
          }}
        />
      </div>

      {metadata && metadata.pruned_at.length > 0 && (
        <div className="mt-2 text-xs font-display" style={{ color: 'var(--cs-text-muted)' }}>
          Pruned {metadata.pruned_at.length} nodes (
          {metadata.pruned_at.map((p) => p.reason).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
          )
        </div>
      )}
    </div>
  );
}
