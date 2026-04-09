import { useState, useRef, useEffect, useCallback } from 'react';
import { startTrace, cancelTrace, createTraceStream } from '../api/trace';
import type { TraceRequest } from '../types/api';

interface TraceProgress {
  nodes: number;
  edges: number;
  hop: number;
  maxHops: number;
  apiCalls: number;
  apiCallsLimit: number;
}

interface TraceMetadata {
  total_nodes: number;
  total_edges: number;
  trace_time_ms: number;
  pruned_at: { address: string; reason: string; hop: number }[];
}

interface GraphHandle {
  addNode: (node: { address: string; label: string | null; risk: string | null; hop: number }) => void;
  addEdges: (edges: { from: string; to: string; value: string; tx_hash: string; token: string; timestamp: number }[]) => void;
  getGraph: () => { nodes: unknown[]; edges: unknown[] };
  finalLayout: () => void;
}

type TraceStatus = 'idle' | 'streaming' | 'completed' | 'failed' | 'cancelled';

export function useTraceStream(graphRef: React.RefObject<GraphHandle | null>) {
  const counters = useRef({ nodes: 0, edges: 0, hop: 0, maxHops: 3, apiCalls: 0, apiCallsLimit: 200 });
  const [progress, setProgress] = useState<TraceProgress | null>(null);
  const [metadata, setMetadata] = useState<TraceMetadata | null>(null);
  const [status, setStatus] = useState<TraceStatus>('idle');
  const [jobId, setJobId] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  // Flush counters to React state every 1 second
  useEffect(() => {
    if (status !== 'streaming') return;
    const interval = setInterval(() => {
      setProgress({ ...counters.current });
    }, 1000);
    return () => clearInterval(interval);
  }, [status]);

  const startTracing = useCallback(async (params: TraceRequest) => {
    // Reset
    counters.current = { nodes: 0, edges: 0, hop: 0, maxHops: params.max_hops, apiCalls: 0, apiCallsLimit: 200 };
    setProgress(null);
    setMetadata(null);
    setStatus('streaming');

    const job = await startTrace(params);
    setJobId(job.job_id);

    const source = createTraceStream(job.job_id);
    sourceRef.current = source;

    source.addEventListener('node_discovered', (e: MessageEvent) => {
      const node = JSON.parse(e.data);
      counters.current.nodes++;
      graphRef.current?.addNode(node);
    });

    source.addEventListener('edge_discovered', (e: MessageEvent) => {
      const batch = JSON.parse(e.data);
      const edgeArray = Array.isArray(batch) ? batch : [batch];
      counters.current.edges += edgeArray.length;
      graphRef.current?.addEdges(edgeArray);
    });

    source.addEventListener('progress', (e: MessageEvent) => {
      const p = JSON.parse(e.data);
      counters.current.hop = p.hop;
      counters.current.maxHops = p.max_hops;
      counters.current.apiCalls = p.api_calls_used;
      counters.current.apiCallsLimit = p.api_calls_limit;
    });

    source.addEventListener('completed', (e: MessageEvent) => {
      setMetadata(JSON.parse(e.data));
      setStatus('completed');
      setProgress({ ...counters.current });
      source.close();
      // Trigger a final layout pass now that all nodes/edges are in
      graphRef.current?.finalLayout();
    });

    source.addEventListener('failed', () => {
      setStatus('failed');
      setProgress({ ...counters.current });
      source.close();
    });

    source.onerror = () => {
      if (status === 'streaming') {
        setStatus('failed');
      }
      source.close();
    };
  }, [graphRef, status]);

  const cancelTracing = useCallback(async () => {
    if (jobId) {
      await cancelTrace(jobId);
    }
    sourceRef.current?.close();
    setStatus('cancelled');
    setProgress({ ...counters.current });
  }, [jobId]);

  return { progress, metadata, status, startTracing, cancelTracing, jobId };
}
