import { useState, useRef, useCallback, useMemo } from 'react';
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
import { useLookup, useRiskScore, useExposure } from './api/hooks';
import { useTraceStream } from './hooks/useTraceStream';
import { useTraceSession } from './stores/traceSessionStore';
import { exportTraceCsv } from './utils/exportCsv';

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
  const { push } = useTraceSession();
  const graphRef = useRef<GraphHandle>(null);
  const { progress, metadata, status: traceStatus, startTracing, cancelTracing } = useTraceStream(graphRef);
  const [traceDirection, setTraceDirection] = useState<'forward' | 'backward'>('forward');
  const [traceMinAmount, setTraceMinAmount] = useState('0');
  const [traceTokenFilter, setTraceTokenFilter] = useState('');

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
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">ChainScope</h1>
          <p className="text-gray-400">On-chain forensics explorer</p>
        </div>

        {/* Search */}
        <AddressInput onSubmit={handleSubmit} isLoading={isLoading} />
        <Breadcrumb onNavigate={handleAddressClick} />
        {!data && !isLoading && <ExampleLookups onSelect={handleSubmit} />}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="mt-8 space-y-4">
            <div className="grid grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-4 h-20 animate-pulse" />
              ))}
            </div>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="bg-gray-800 rounded h-10 animate-pulse" />
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
          <div className="mt-6 bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-3">
            {data.warnings.map((w, i) => (
              <p key={i} className="text-yellow-400 text-sm">{w}</p>
            ))}
          </div>
        )}

        {/* Results */}
        {data && !isLoading && (
          <div className="mt-8">
            {/* Address header */}
            <div className="mb-4">
              <p className="text-gray-400 text-sm">
                <span className="uppercase font-medium text-gray-300">{data.chain}</span>
                {' '}&middot;{' '}
                <span className="font-mono text-xs">{data.address}</span>
              </p>
            </div>

            {/* Risk + Stats */}
            {riskData && (
              <div className="mb-4">
                <RiskBadge risk={riskData} />
              </div>
            )}
            <StatsHeader stats={data.stats} chain={data.chain} />
            {exposureData && (
              <div className="mb-4">
                <ExposureChart data={exposureData as { direct_exposure: Record<string, string>; indirect_exposure: Record<string, string>; total_volume_analyzed: string; hops_analyzed: number }} />
              </div>
            )}

            {/* Trace */}
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
            <GraphView ref={graphRef} />

            {/* Flow tree + filters (visible after trace starts) */}
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

            {/* Filters */}
            <FilterBar
              spamCount={data.spam_filtered}
              failedCount={data.failed_filtered}
              dustCount={data.dust_filtered}
            />

            {/* Transaction table */}
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
