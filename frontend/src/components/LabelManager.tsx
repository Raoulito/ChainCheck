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
  return diff > 7 * 24 * 60 * 60 * 1000;
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
        <button onClick={() => setOpen(true)} className="cs-btn-ghost">
          Label Manager
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 cs-card p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold font-display" style={{ color: 'var(--cs-text-primary)' }}>Label Manager</h2>
        <button
          onClick={() => setOpen(false)}
          className="text-sm font-display transition-colors"
          style={{ color: 'var(--cs-text-muted)' }}
          onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cs-text-primary)'}
          onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cs-text-muted)'}
        >
          Close
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="cs-card-surface p-3">
            <p className="text-xs font-display uppercase tracking-wider" style={{ color: 'var(--cs-text-muted)' }}>Total labels</p>
            <p className="text-xl font-bold font-mono mt-1" style={{ color: 'var(--cs-accent)' }}>{stats.total_labels.toLocaleString()}</p>
          </div>
          <div className="cs-card-surface p-3">
            <p className="text-xs font-display uppercase tracking-wider mb-1" style={{ color: 'var(--cs-text-muted)' }}>By source</p>
            <div className="space-y-0.5">
              {Object.entries(stats.by_source)
                .sort(([, a], [, b]) => b - a)
                .map(([src, cnt]) => (
                  <div key={src} className="flex justify-between text-xs font-mono">
                    <span style={{ color: 'var(--cs-text-secondary)' }}>{src}</span>
                    <span style={{ color: 'var(--cs-text-muted)' }}>{cnt}</span>
                  </div>
                ))}
            </div>
          </div>
          <div className="cs-card-surface p-3">
            <p className="text-xs font-display uppercase tracking-wider mb-1" style={{ color: 'var(--cs-text-muted)' }}>By type</p>
            <div className="space-y-0.5">
              {Object.entries(stats.by_type)
                .sort(([, a], [, b]) => b - a)
                .map(([typ, cnt]) => (
                  <div key={typ} className="flex justify-between text-xs font-mono">
                    <span style={{ color: 'var(--cs-text-secondary)' }}>{typ}</span>
                    <span style={{ color: 'var(--cs-text-muted)' }}>{cnt}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Sync status */}
      {!syncing && !syncDone && Object.keys(syncLogs).length > 0 && (
        <div className="cs-card-surface rounded-lg p-3 mb-4">
          <p className="text-xs font-display uppercase tracking-wider mb-2" style={{ color: 'var(--cs-text-muted)' }}>Last sync</p>
          <div className="space-y-1.5">
            {ALL_SOURCES.map((src) => {
              const log = syncLogs[src];
              return (
                <div key={src} className="flex items-center justify-between text-xs font-display">
                  <span style={{ color: 'var(--cs-text-secondary)' }}>{SOURCE_LABELS[src] || src}</span>
                  {log ? (
                    <span className="font-mono" style={{ color: isStale(log.last_synced_at) ? 'var(--cs-yellow)' : 'var(--cs-text-muted)' }}>
                      {timeAgo(log.last_synced_at)} &middot; {log.total_labels} labels
                      {isStale(log.last_synced_at) && ' (stale)'}
                    </span>
                  ) : (
                    <span className="font-mono" style={{ color: 'var(--cs-yellow)' }}>never synced</span>
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
          className={hasStale || neverSynced ? 'cs-btn-primary' : 'cs-btn-ghost'}
          style={{ fontSize: '13px', padding: '8px 18px' }}
        >
          {syncing ? 'Syncing...' : hasStale || neverSynced ? 'Sync all sources now' : 'Force re-sync (all fresh)'}
        </button>
        {!syncing && !hasStale && !neverSynced && (
          <span className="text-xs font-display ml-3" style={{ color: 'var(--cs-text-muted)' }}>All sources synced within the last 7 days</span>
        )}
      </div>

      {/* Progress */}
      {(syncing || syncDone) && sources.length > 0 && (
        <div className="mb-4 cs-card-surface rounded-lg p-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--cs-bg-base)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: syncDone
                    ? 'var(--cs-green)'
                    : 'linear-gradient(90deg, var(--cs-accent), var(--cs-accent-bright))',
                }}
              />
            </div>
            <span className="text-xs font-mono w-10 text-right" style={{ color: 'var(--cs-text-muted)' }}>
              {progressPct}%
            </span>
          </div>

          {syncing && currentSource && (
            <p className="text-xs font-display mb-2" style={{ color: 'var(--cs-accent)' }}>
              <span className="cs-live-dot inline-block mr-1" style={{ width: 6, height: 6 }} />
              Importing {SOURCE_LABELS[currentSource.name] || currentSource.name}...
              {currentSource.prev && (
                <span className="font-mono ml-1" style={{ color: 'var(--cs-text-muted)' }}>
                  (last: {timeAgo(currentSource.prev.last_synced_at)}, {currentSource.prev.total_labels} labels)
                </span>
              )}
            </p>
          )}

          <div className="space-y-1">
            {sources.map((s, i) => (
              <div key={i} className="flex items-center gap-2 text-xs font-display">
                <span className="w-4 text-center">
                  {s.status === 'done' && <span style={{ color: 'var(--cs-green)' }}>+</span>}
                  {s.status === 'running' && <span className="cs-live-dot inline-block" style={{ width: 6, height: 6 }} />}
                  {s.status === 'pending' && <span style={{ color: 'var(--cs-text-dim)' }}>-</span>}
                  {s.status === 'error' && <span style={{ color: 'var(--cs-red)' }}>!</span>}
                </span>
                <span style={{
                  color: s.status === 'done' ? 'var(--cs-text-secondary)' :
                    s.status === 'running' ? 'var(--cs-accent)' : 'var(--cs-text-dim)'
                }}>
                  {SOURCE_LABELS[s.name] || s.name || `Source ${i + 1}`}
                </span>
                {s.status === 'done' && s.count !== undefined && (
                  <span className="font-mono" style={{ color: s.count > 0 ? 'var(--cs-green)' : 'var(--cs-text-muted)' }}>
                    {s.count > 0 ? `+${s.count}` : '0 new'}
                  </span>
                )}
              </div>
            ))}
          </div>

          {syncDone && (
            <p className="text-sm font-display mt-2 pt-2" style={{ color: 'var(--cs-green)', borderTop: '1px solid var(--cs-border)' }}>
              Sync complete &mdash; {totalNew} new label{totalNew !== 1 ? 's' : ''} added
            </p>
          )}
        </div>
      )}

      <BatchLabelForm />
    </div>
  );
}
