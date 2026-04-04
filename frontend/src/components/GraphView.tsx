import { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import cytoscapeDagre from 'cytoscape-dagre';
import { useGraphLayout } from '../hooks/useGraphLayout';

// Register dagre layout extension
cytoscape.use(cytoscapeDagre);

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

const RISK_COLORS: Record<string, string> = {
  LOW: '#22c55e',
  MEDIUM: '#eab308',
  HIGH: '#f97316',
  SEVERE: '#ef4444',
};

const ENTITY_SHAPES: Record<string, cytoscape.Css.NodeShape> = {
  exchange: 'hexagon',
  defi: 'diamond',
  mixer: 'pentagon',
  sanctioned: 'square',
};

interface GraphViewProps {
  onAddressClick?: (address: string) => void;
}

export const GraphView = forwardRef<GraphHandle, GraphViewProps>(
  function GraphView({ onAddressClick }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const nodesRef = useRef<Map<string, GraphNode>>(new Map());
    const edgesRef = useRef<GraphEdge[]>([]);
    const [nodeCount, setNodeCount] = useState(0);
    const { positions, isComputing, computeLayout } = useGraphLayout();

    // Initialize Cytoscape
    useEffect(() => {
      if (!containerRef.current) return;

      const cy = cytoscape({
        container: containerRef.current,
        style: [
          {
            selector: 'node',
            style: {
              'background-color': '#4b5563',
              label: 'data(displayLabel)',
              'font-size': '10px',
              color: '#e5e7eb',
              'text-valign': 'bottom',
              'text-margin-y': 6,
              width: 'data(size)',
              height: 'data(size)',
              'border-width': 2,
              'border-color': '#6b7280',
            },
          },
          {
            selector: 'node[riskColor]',
            style: {
              'border-color': 'data(riskColor)',
              'border-width': 3,
            },
          },
          {
            selector: 'node[entityShape]',
            style: {
              shape: 'data(entityShape)' as unknown as cytoscape.Css.NodeShape,
            },
          },
          {
            selector: 'node.root',
            style: {
              'background-color': '#3b82f6',
              'border-color': '#60a5fa',
              'border-width': 3,
            },
          },
          {
            selector: 'edge',
            style: {
              width: 'data(thickness)',
              'line-color': '#4b5563',
              'target-arrow-color': '#4b5563',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              label: 'data(edgeLabel)',
              'font-size': '8px',
              color: '#9ca3af',
              'text-rotation': 'autorotate',
            },
          },
          {
            selector: 'edge.sanctioned',
            style: {
              'line-color': '#ef4444',
              'target-arrow-color': '#ef4444',
            },
          },
        ],
        layout: { name: 'preset' },
        minZoom: 0.1,
        maxZoom: 5,
      });

      // Click handler
      cy.on('tap', 'node', (evt) => {
        const addr = evt.target.data('id');
        if (addr && onAddressClick) onAddressClick(addr);
      });

      // Hover tooltip via title
      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        containerRef.current!.title = `${node.data('fullAddress')}\n${node.data('labelText') || 'Unknown'}`;
      });
      cy.on('mouseout', 'node', () => {
        containerRef.current!.title = '';
      });

      cyRef.current = cy;

      return () => {
        cy.destroy();
        cyRef.current = null;
      };
    }, [onAddressClick]);

    // Apply positions from layout worker
    useEffect(() => {
      const cy = cyRef.current;
      if (!cy || Object.keys(positions).length === 0) return;

      cy.batch(() => {
        for (const [id, pos] of Object.entries(positions)) {
          const node = cy.getElementById(id);
          if (node.length > 0) {
            node.position(pos);
          }
        }
      });
      cy.fit(undefined, 40);
    }, [positions]);

    const runLayout = useCallback(() => {
      const nodes = Array.from(nodesRef.current.values()).map(n => ({
        id: n.address,
        label: n.label ?? undefined,
      }));
      const edges = edgesRef.current.map(e => ({
        source: e.from,
        target: e.to,
      }));
      if (nodes.length > 0) {
        computeLayout(nodes, edges, 'dagre');
      }
    }, [computeLayout]);

    useImperativeHandle(ref, () => ({
      addNode(node: GraphNode) {
        nodesRef.current.set(node.address, node);
        const cy = cyRef.current;
        if (cy && !cy.getElementById(node.address).length) {
          const truncAddr = node.address.length > 12
            ? `${node.address.slice(0, 6)}...${node.address.slice(-4)}`
            : node.address;

          cy.add({
            group: 'nodes',
            data: {
              id: node.address,
              displayLabel: node.label ?? truncAddr,
              fullAddress: node.address,
              labelText: node.label,
              size: node.hop === 0 ? 40 : Math.max(20, 35 - node.hop * 5),
              riskColor: node.risk ? RISK_COLORS[node.risk] : undefined,
              entityShape: undefined, // Will be set when entity data is available
            },
            classes: node.hop === 0 ? 'root' : undefined,
            position: { x: Math.random() * 400, y: Math.random() * 400 },
          });
          setNodeCount(nodesRef.current.size);
        }
      },

      addEdges(edges: GraphEdge[]) {
        for (const edge of edges) {
          edgesRef.current.push(edge);
          const cy = cyRef.current;
          if (!cy) continue;

          const edgeId = `${edge.from}-${edge.to}-${edge.tx_hash}`;
          if (cy.getElementById(edgeId).length) continue;

          // Compute edge thickness based on value
          let thickness = 1;
          try {
            const val = BigInt(edge.value);
            thickness = Math.max(1, Math.min(6, Number(val > 0n ? BigInt(Math.ceil(Math.log10(Number(val) + 1))) : 0n)));
          } catch { /* ignore */ }

          // Format edge label
          let edgeLabel = '';
          try {
            const val = Number(BigInt(edge.value));
            if (edge.token === 'ETH' && val > 0) edgeLabel = `${(val / 1e18).toFixed(2)} ETH`;
            else if (edge.token === 'BTC' && val > 0) edgeLabel = `${(val / 1e8).toFixed(4)} BTC`;
            else if (val > 0) edgeLabel = `${val} ${edge.token}`;
          } catch { /* ignore */ }

          cy.add({
            group: 'edges',
            data: {
              id: edgeId,
              source: edge.from,
              target: edge.to,
              thickness,
              edgeLabel,
            },
          });
        }
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
        setNodeCount(0);
        cyRef.current?.elements().remove();
      },
    }));

    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mt-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
          <span className="text-xs text-gray-400">
            Cytoscape ({nodeCount} nodes)
          </span>
          <div className="flex items-center gap-2">
            {isComputing && (
              <span className="text-xs text-yellow-400 animate-pulse">Computing layout...</span>
            )}
            <button
              onClick={runLayout}
              className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              Re-layout
            </button>
            <button
              onClick={() => cyRef.current?.fit(undefined, 40)}
              className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              Fit
            </button>
          </div>
        </div>

        {/* Graph container */}
        <div
          ref={containerRef}
          className="w-full bg-gray-900"
          style={{ height: '500px' }}
        />
      </div>
    );
  },
);
