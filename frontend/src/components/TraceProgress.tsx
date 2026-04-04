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
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-gray-200">
          {status === 'streaming' && (
            <>
              <span className="inline-block w-2 h-2 bg-green-400 rounded-full animate-pulse mr-2" />
              Tracing hop {progress?.hop ?? 0} of {progress?.maxHops ?? '?'}...
            </>
          )}
          {status === 'completed' && 'Trace complete'}
          {status === 'failed' && 'Trace failed'}
          {status === 'cancelled' && 'Trace cancelled'}
        </p>
        {metadata && (
          <span className="text-xs text-gray-500">
            {(metadata.trace_time_ms / 1000).toFixed(1)}s
          </span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 text-xs">
        <div>
          <span className="text-gray-500">Addresses</span>
          <p className="text-gray-200 font-medium">{progress?.nodes ?? 0}</p>
        </div>
        <div>
          <span className="text-gray-500">Edges</span>
          <p className="text-gray-200 font-medium">{progress?.edges ?? 0}</p>
        </div>
        <div>
          <span className="text-gray-500">API calls</span>
          <p className="text-gray-200 font-medium">
            {progress?.apiCalls ?? 0}/{progress?.apiCallsLimit ?? 200}
          </p>
        </div>
      </div>

      {/* API budget bar */}
      <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${apiPct > 80 ? 'bg-red-500' : 'bg-blue-500'}`}
          style={{ width: `${apiPct}%` }}
        />
      </div>

      {/* Pruning info */}
      {metadata && metadata.pruned_at.length > 0 && (
        <div className="mt-2 text-xs text-gray-500">
          Pruned {metadata.pruned_at.length} nodes (
          {metadata.pruned_at.map((p) => p.reason).filter((v, i, a) => a.indexOf(v) === i).join(', ')}
          )
        </div>
      )}
    </div>
  );
}
