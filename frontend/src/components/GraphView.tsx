import { forwardRef, useImperativeHandle, useRef } from 'react';

interface GraphNode {
  address: string;
  label: string | null;
  risk: string | null;
  hop: number;
}

interface GraphEdge {
  from: string;
  to: string;
  value: string;
  tx_hash: string;
  token: string;
  timestamp: number;
}

export interface GraphHandle {
  addNode: (node: GraphNode) => void;
  addEdges: (edges: GraphEdge[]) => void;
  getGraph: () => { nodes: GraphNode[]; edges: GraphEdge[] };
  clear: () => void;
}

export const GraphView = forwardRef<GraphHandle>(function GraphView(_props, ref) {
  const nodesRef = useRef<Map<string, GraphNode>>(new Map());
  const edgesRef = useRef<GraphEdge[]>([]);

  useImperativeHandle(ref, () => ({
    addNode(node: GraphNode) {
      nodesRef.current.set(node.address, node);
    },
    addEdges(edges: GraphEdge[]) {
      edgesRef.current.push(...edges);
    },
    getGraph() {
      return {
        nodes: Array.from(nodesRef.current.values()),
        edges: edgesRef.current,
      };
    },
    clear() {
      nodesRef.current.clear();
      edgesRef.current = [];
    },
  }));

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
      <p className="text-gray-400 text-sm">
        Graph visualization will be rendered here (Step 7).
      </p>
      <p className="text-gray-500 text-xs mt-2">
        Data is being collected via the imperative handle during trace streaming.
      </p>
    </div>
  );
});
