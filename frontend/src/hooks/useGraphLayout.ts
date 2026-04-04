import { useState, useRef, useCallback } from 'react';
import type { LayoutResult } from '../workers/layoutWorker';

type LayoutType = 'dagre' | 'circular';

interface LayoutNode {
  id: string;
  label?: string;
}

interface LayoutEdge {
  source: string;
  target: string;
}

export function useGraphLayout() {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [isComputing, setIsComputing] = useState(false);
  const workerRef = useRef<Worker | null>(null);

  const computeLayout = useCallback((
    nodes: LayoutNode[],
    edges: LayoutEdge[],
    layout: LayoutType = 'dagre',
  ) => {
    // Terminate previous worker if still running
    workerRef.current?.terminate();
    setIsComputing(true);

    const worker = new Worker(
      new URL('../workers/layoutWorker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<LayoutResult>) => {
      setPositions(e.data.positions);
      setIsComputing(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.onerror = () => {
      setIsComputing(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage({ nodes, edges, layout });
  }, []);

  const cancelLayout = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setIsComputing(false);
  }, []);

  return { positions, isComputing, computeLayout, cancelLayout };
}
