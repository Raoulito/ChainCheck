import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { AddressInput } from './components/AddressInput';
import { ExampleLookups } from './components/ExampleLookups';
import { StatsHeader } from './components/StatsHeader';
import { FilterBar } from './components/FilterBar';
import { TxTable } from './components/TxTable';
import { ErrorBanner } from './components/ErrorBanner';
import { Breadcrumb } from './components/Breadcrumb';
import { RiskBadge } from './components/RiskBadge';
import { ExposureChart } from './components/ExposureChart';
import { TraceControls } from './components/TraceControls';
import { TraceProgress } from './components/TraceProgress';
import { GraphView } from './components/GraphView';
import type { GraphHandle } from './components/GraphView';
import { FlowTree } from './components/FlowTree';
import { TraceFilterControls } from './components/TraceFilterControls';
import { AnalysisPanel } from './components/AnalysisPanel';
import { CaseManager } from './components/CaseManager';
import { AddLabelForm } from './components/AddLabelForm';
import { LabelManager } from './components/LabelManager';
import { useLookup, useAddressLabel, useRiskScore, useExposure } from './api/hooks';
import { useTraceStream } from './hooks/useTraceStream';
import { useTraceSession } from './stores/traceSessionStore';
import { exportTraceCsv } from './utils/exportCsv';
import { getLabelStatus } from './api/client';
import type { LabelStatusResponse } from './api/client';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Explorer() {
  const [chain, setChain] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [labelStats, setLabelStats] = useState<LabelStatusResponse | null>(null);

  useEffect(() => {
    getLabelStatus().then(setLabelStats).catch(() => {});
  }, []);
  const { push } = useTraceSession();
  const graphRef = useRef<GraphHandle>(null);
  const { progress, metadata, status: traceStatus, startTracing, cancelTracing, peelingChain } = useTraceStream(graphRef);
  const [traceDirection, setTraceDirection] = useState<'forward' | 'backward'>('forward');
  const [traceMinAmount, setTraceMinAmount] = useState('0');
  const [traceTokenFilter, setTraceTokenFilter] = useState('');

  const { data: labelData } = useAddressLabel(address);
  const { data, isLoading, error, refetch } = useLookup(chain, address, page);
  const { data: riskData } = useRiskScore(address, chain);
  const { data: exposureData } = useExposure(address, chain);

  const handleSubmit = (newChain: string, newAddress: string) => {
    setChain(newChain);
    setAddress(newAddress);
    setPage(1);
    push({ chain: newChain, address: newAddress });
  };

  const handleAddressClick = (newChain: string, newAddress: string) => {
    setChain(newChain);
    setAddress(newAddress);
    setPage(1);
    push({ chain: newChain, address: newAddress });
  };

  const totalPages = data ? Math.ceil(data.total / data.per_page) : 0;

  return (
    <div className="min-h-screen" style={{ background: 'var(--cs-bg-deep)' }}>
      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* Header */}
        <header className="text-center mb-12 cs-fade-up">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'var(--cs-accent-dim)', border: '1px solid var(--cs-accent)' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--cs-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                <path d="M2 12h20" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold font-display tracking-tight" style={{ color: 'var(--cs-text-primary)' }}>
              Chain<span style={{ color: 'var(--cs-accent)' }}>Scope</span>
            </h1>
          </div>
          <p className="text-sm font-display" style={{ color: 'var(--cs-text-muted)', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
            On-chain forensics explorer
          </p>
          {labelStats && (
            <div className="mt-5 inline-flex items-center gap-5 px-5 py-2.5 rounded-lg" style={{ background: 'var(--cs-bg-raised)', border: '1px solid var(--cs-border)' }}>
              <span className="text-xs font-display" style={{ color: 'var(--cs-text-secondary)' }}>
                <span className="font-semibold" style={{ color: 'var(--cs-accent)' }}>{labelStats.total_labels.toLocaleString()}</span> known addresses
              </span>
              {Object.entries(labelStats.by_chain).map(([ch, count]) => (
                <span key={ch} className="text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
                  <span className="uppercase" style={{ color: 'var(--cs-text-secondary)' }}>{ch}</span>{' '}{count.toLocaleString()}
                </span>
              ))}
            </div>
          )}
        </header>

        {/* Search */}
        <div className="cs-fade-up" style={{ animationDelay: '0.1s' }}>
          <AddressInput onSubmit={handleSubmit} isLoading={isLoading} />
        </div>
        <Breadcrumb onNavigate={handleAddressClick} />
        {!data && !isLoading && (
          <div className="cs-fade-up" style={{ animationDelay: '0.2s' }}>
            <ExampleLookups onSelect={handleSubmit} />
            <LabelManager />
            <CaseManager onOpenInvestigation={(_id, addr, ch) => handleSubmit(ch, addr)} />
          </div>
        )}

        {/* Instant local data */}
        {address && chain && (
          <div className="mt-8 cs-fade-up">
            <div className="mb-4">
              <div className="flex items-center gap-3 flex-wrap">
                <p className="font-display text-sm" style={{ color: 'var(--cs-text-secondary)' }}>
                  <span className="uppercase font-semibold tracking-wider" style={{ color: 'var(--cs-accent)' }}>{chain}</span>
                  {' '}<span style={{ color: 'var(--cs-text-muted)' }}>&middot;</span>{' '}
                  <span className="font-mono text-xs" style={{ color: 'var(--cs-text-secondary)' }}>{address}</span>
                </p>
                <AddLabelForm address={address} chain={chain} />
              </div>
            </div>

            {labelData && (
              <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--cs-blue-dim)', border: '1px solid var(--cs-blue)' }}>
                <span className="text-xs font-semibold" style={{ color: 'var(--cs-blue)' }}>{labelData.entity_name}</span>
                <span className="text-xs" style={{ color: 'var(--cs-text-muted)' }}>({labelData.entity_type})</span>
                <span className="text-xs" style={{ color: 'var(--cs-text-dim)', fontSize: '10px' }}>{labelData.source}</span>
              </div>
            )}

            {riskData && (
              <div className="mb-4">
                <RiskBadge risk={riskData} />
              </div>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && address && (
          <div className="space-y-4 mt-8">
            <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--cs-text-muted)' }}>
              <span className="cs-live-dot" />
              <span className="font-display">Fetching on-chain data...</span>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="cs-skeleton h-20 rounded-xl" style={{ animationDelay: `${i * 0.1}s` }} />
              ))}
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="cs-skeleton h-10 rounded-lg" style={{ animationDelay: `${(i + 4) * 0.05}s` }} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-8">
            <ErrorBanner
              message={error instanceof Error ? error.message : 'Unknown error'}
              onRetry={() => refetch()}
            />
          </div>
        )}

        {/* Warnings */}
        {data?.warnings && data.warnings.length > 0 && (
          <div className="mt-6 rounded-xl p-4" style={{ background: 'var(--cs-yellow-dim)', border: '1px solid var(--cs-yellow)' }}>
            {data.warnings.map((w, i) => (
              <p key={i} className="text-sm font-display" style={{ color: 'var(--cs-yellow)' }}>{w}</p>
            ))}
          </div>
        )}

        {/* Full results */}
        {data && !isLoading && (
          <div className="cs-fade-up">
            <StatsHeader stats={data.stats} chain={data.chain} />
            {exposureData && (
              <div className="mb-4">
                <ExposureChart data={exposureData as { direct_exposure: Record<string, string>; indirect_exposure: Record<string, string>; total_volume_analyzed: string; hops_analyzed: number }} />
              </div>
            )}

            <TraceControls
              address={data.address}
              chain={data.chain}
              onStartTrace={(params) => {
                setTraceDirection(params.direction);
                graphRef.current?.clear();
                startTracing(params);
              }}
              isTracing={traceStatus === 'streaming'}
              onCancel={cancelTracing}
            />
            <TraceProgress progress={progress} status={traceStatus} metadata={metadata} />

            {/* Peeling chain alert */}
            {peelingChain && peelingChain.detected && (
              <div className="mt-3 p-4 rounded-xl" style={{ background: 'var(--cs-orange-dim)', border: '1px solid var(--cs-orange)' }}>
                <p className="text-sm font-semibold font-display" style={{ color: 'var(--cs-orange)' }}>
                  Peeling chain detected: {peelingChain.chain_length} hops, {(Number(peelingChain.total_peeled) / 1e8).toFixed(4)} BTC extracted to {peelingChain.peel_destinations.length} destinations
                </p>
                {peelingChain.peel_destinations.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {peelingChain.peel_destinations.map((d, i) => (
                      <div key={i} className="text-xs font-mono" style={{ color: 'var(--cs-orange)', opacity: 0.8 }}>
                        {d.label}: {(Number(d.amount) / 1e8).toFixed(6)} BTC ({d.address.slice(0, 8)}...{d.address.slice(-4)})
                      </div>
                    ))}
                  </div>
                )}
                {peelingChain.remainder_address && (
                  <p className="mt-1 text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
                    Remainder: {(Number(peelingChain.remainder_amount) / 1e8).toFixed(4)} BTC at {peelingChain.remainder_address.slice(0, 8)}...{peelingChain.remainder_address.slice(-4)}
                  </p>
                )}
              </div>
            )}

            <GraphView ref={graphRef} chain={data.chain} onAddressClick={(addr) => handleAddressClick(data.chain, addr)} />

            {traceStatus !== 'idle' && (
              <>
                <TraceFilterControls
                  minAmount={traceMinAmount}
                  onMinAmountChange={setTraceMinAmount}
                  tokenFilter={traceTokenFilter}
                  onTokenFilterChange={setTraceTokenFilter}
                  availableTokens={(() => {
                    const graph = graphRef.current?.getGraph();
                    if (!graph) return [];
                    const tokens = new Set(graph.edges.map(e => e.token));
                    return Array.from(tokens);
                  })()}
                  onExport={() => {
                    const graph = graphRef.current?.getGraph();
                    if (graph) exportTraceCsv(graph.nodes, graph.edges, data.address);
                  }}
                  hasData={(graphRef.current?.getGraph()?.edges.length ?? 0) > 0}
                />
                <FlowTree
                  graphRef={graphRef}
                  rootAddress={data.address}
                  direction={traceDirection}
                  isStreaming={traceStatus === 'streaming'}
                  onAddressClick={handleAddressClick}
                  chain={data.chain}
                  minAmount={traceMinAmount}
                  tokenFilter={traceTokenFilter || undefined}
                />
              </>
            )}

            <AnalysisPanel
              transactions={data.transactions}
              address={data.address}
              chain={data.chain}
              onAddressClick={handleAddressClick}
            />

            <FilterBar
              spamCount={data.spam_filtered}
              failedCount={data.failed_filtered}
              dustCount={data.dust_filtered}
            />

            <TxTable
              transactions={data.transactions}
              chain={data.chain}
              address={data.address}
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              onAddressClick={handleAddressClick}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Explorer />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
