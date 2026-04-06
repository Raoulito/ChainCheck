import { useState, useEffect, useRef } from 'react';
import { createSyncStream, getLabelStatus, getSyncStatus } from '../api/client';
import type { LabelStatusResponse, SyncSourceLog } from '../api/client';
import { BatchLabelForm } from './BatchLabelForm';

const SOURCE_LABELS: Record<string, string> = {
  etherscan: 'Etherscan known labels',
  ofac_sdn: 'OFAC SDN list',
  opensanctions: 'OpenSanctions',
  walletexplorer: 'WalletExplorer BTC',
  chainabuse: 'ChainAbuse reports',
};

const ALL_SOURCES = ['etherscan', 'ofac_sdn', 'opensanctions', 'walletexplorer', 'chainabuse'];

interface SourceProgress {
  name: string;
  status: 'pending' | 'running' | 'done' | 'error';
  count?: number;
  prev?: { last_synced_at: string; total_labels: number } | null;
}

function timeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function isStale(isoDate: string): boolean {
  const diff = Date.now() - new Date(isoDate).getTime();
  return diff > 7 * 24 * 60 * 60 * 1000; // older than 7 days
}

export function LabelManager() {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<LabelStatusResponse | null>(null);
  const [syncLogs, setSyncLogs] = useState<Record<string, SyncSourceLog>>({});
  const [syncing, setSyncing] = useState(false);
  const [sources, setSources] = useState<SourceProgress[]>([]);
  const [syncDone, setSyncDone] = useState(false);
  const [totalNew, setTotalNew] = useState(0);
  const esRef = useRef<EventSource | null>(null);

  const fetchStats = () => {
    getLabelStatus().then(setStats).catch(() => {});
    getSyncStatus().then((d) => setSyncLogs(d.sources)).catch(() => {});
  };

  useEffect(() => {
    if (open) fetchStats();
  }, [open]);

  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  const hasStale = ALL_SOURCES.some((s) => {
    const log = syncLogs[s];
    return !log || isStale(log.last_synced_at);
  });
  const neverSynced = ALL_SOURCES.some((s) => !syncLogs[s]);

  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    setSyncDone(false);
    setTotalNew(0);
    setSources([]);

    const es = createSyncStream();
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.event === 'source_start') {
          setSources((prev) => {
            if (prev.length === 0) {
              const all: SourceProgress[] = Array.from({ length: data.total }, () => ({
                name: '', status: 'pending' as const,
              }));
              all[data.index] = { name: data.source, status: 'running', prev: data.prev };
              return all;
            }
            const next = [...prev];
            next[data.index] = { name: data.source, status: 'running', prev: data.prev };
            return next;
          });
        }

        if (data.event === 'source_done') {
          setSources((prev) => {
            const next = [...prev];
            next[data.index] = {
              ...next[data.index],
              name: data.source,
              status: 'done',
              count: data.count,
            };
            return next;
          });
        }

        if (data.event === 'completed') {
          setTotalNew(data.total_new);
          setSyncDone(true);
          setSyncing(false);
          es.close();
          esRef.current = null;
          fetchStats();
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      setSyncing(false);
      setSyncDone(true);
      es.close();
      esRef.current = null;
    };
  };

  const completedCount = sources.filter((s) => s.status === 'done').length;
  const totalSources = sources.length || 5;
  const progressPct = totalSources > 0 ? Math.round((completedCount / totalSources) * 100) : 0;
  const currentSource = sources.find((s) => s.status === 'running');

  if (!open) {
    return (
      <div className="mt-4">
        <button
          onClick={() => setOpen(true)}
          className="text-sm px-4 py-2 rounded bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-600"
        >
          Label Manager
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 bg-gray-800/50 border border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-white">Label Manager</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-gray-400 hover:text-white text-sm px-2"
        >
          Close
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-900 rounded p-3">
            <p className="text-xs text-gray-400">Total labels</p>
            <p className="text-xl font-bold text-white">{stats.total_labels.toLocaleString()}</p>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <p className="text-xs text-gray-400 mb-1">By source</p>
            <div className="space-y-0.5">
              {Object.entries(stats.by_source)
                .sort(([, a], [, b]) => b - a)
                .map(([src, cnt]) => (
                  <div key={src} className="flex justify-between text-xs">
                    <span className="text-gray-300">{src}</span>
                    <span className="text-gray-400">{cnt}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="bg-gray-900 rounded p-3">
            <p className="text-xs text-gray-400 mb-1">By type</p>
            <div className="space-y-0.5">
              {Object.entries(stats.by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([typ, cnt]) => (
                  <div key={typ} className="flex justify-between text-xs">
                    <span className="text-gray-300">{typ}</span>
                    <span className="text-gray-400">{cnt}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Sync status per source */}
      {!syncing && !syncDone && Object.keys(syncLogs).length > 0 && (
        <div className="bg-gray-900 rounded-lg p-3 mb-4">
          <p className="text-xs text-gray-400 mb-2">Last sync</p>
          <div className="space-y-1">
            {ALL_SOURCES.map((src) => {
              const log = syncLogs[src];
              return (
                <div key={src} className="flex items-center justify-between text-xs">
                  <span className="text-gray-300">{SOURCE_LABELS[src] || src}</span>
                  {log ? (
                    <span className={isStale(log.last_synced_at) ? 'text-yellow-400' : 'text-gray-500'}>
                      {timeAgo(log.last_synced_at)}
                      {' '}&middot;{' '}
                      {log.total_labels} labels
                      {isStale(log.last_synced_at) && ' (stale)'}
                    </span>
                  ) : (
                    <span className="text-yellow-400">never synced</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Sync button */}
      <div className="mb-4">
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`text-sm px-4 py-1.5 rounded text-white disabled:opacity-50 ${
            hasStale || neverSynced
              ? 'bg-indigo-700 hover:bg-indigo-600'
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {syncing ? 'Syncing...' : hasStale || neverSynced ? 'Sync all sources now' : 'Force re-sync (all fresh)'}
        </button>
        {!syncing && !hasStale && !neverSynced && (
          <span className="text-xs text-gray-500 ml-3">All sources synced within the last 7 days</span>
        )}
      </div>

      {/* Progress bar + source list */}
      {(syncing || syncDone) && sources.length > 0 && (
        <div className="mb-4 bg-gray-900 rounded-lg p-3">
          {/* Bar */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 bg-gray-700 rounded-full h-2.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  syncDone ? 'bg-green-500' : 'bg-indigo-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-xs text-gray-400 w-10 text-right">
              {progressPct}%
            </span>
          </div>

          {/* Current source */}
          {syncing && currentSource && (
            <p className="text-xs text-indigo-400 mb-2 animate-pulse">
              Importing {SOURCE_LABELS[currentSource.name] || currentSource.name}...
              {currentSource.prev && (
                <span className="text-gray-500 ml-1">
                  (last: {timeAgo(currentSource.prev.last_synced_at)}, {currentSource.prev.total_labels} labels)
                </span>
              )}
            </p>
          )}

          {/* Source list */}
          <div className="space-y-1">
            {sources.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span className="w-4 text-center">
                  {s.status === 'done' && <span className="text-green-400">+</span>}
                  {s.status === 'running' && <span className="text-indigo-400 animate-pulse">~</span>}
                  {s.status === 'pending' && <span className="text-gray-600">-</span>}
                  {s.status === 'error' && <span className="text-red-400">!</span>}
                </span>
                <span className={
                  s.status === 'done' ? 'text-gray-300' :
                  s.status === 'running' ? 'text-indigo-300' :
                  'text-gray-600'
                }>
                  {SOURCE_LABELS[s.name] || s.name || `Source ${i + 1}`}
                </span>
                {s.status === 'done' && s.count !== undefined && (
                  <span className={s.count > 0 ? 'text-green-400' : 'text-gray-500'}>
                    {s.count > 0 ? `+${s.count}` : '0 new'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Summary */}
          {syncDone && (
            <p className="text-sm text-green-400 mt-2 pt-2 border-t border-gray-700">
              Sync complete — {totalNew} new label{totalNew !== 1 ? 's' : ''} added
            </p>
          )}
        </div>
      )}

      {/* Batch label form */}
      <BatchLabelForm />
    </div>
  );
}
