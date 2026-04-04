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

type LayoutType = 'dagre' | 'circular';

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
    const [edgeCount, setEdgeCount] = useState(0);
    const [showLabels, setShowLabels] = useState(true);
    const [layoutType, setLayoutType] = useState<LayoutType>('dagre');
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
            selector: 'node.root',
            style: {
              'background-color': '#3b82f6',
              'border-color': '#60a5fa',
              'border-width': 3,
            },
          },
          {
            selector: 'node.hidden-label',
            style: {
              label: '',
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
          {
            selector: 'edge.hidden-label',
            style: {
              label: '',
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

      // Tooltip popover on hover
      cy.on('mouseover', 'node', (evt) => {
        const node = evt.target;
        const addr = node.data('fullAddress') || '';
        const label = node.data('labelText') || 'Unknown';
        const hop = node.data('hopLevel') ?? '?';
        containerRef.current!.title = `${addr}\nLabel: ${label}\nHop: ${hop}`;
      });
      cy.on('mouseout', 'node', () => {
        containerRef.current!.title = '';
      });

      // Edge tooltip
      cy.on('mouseover', 'edge', (evt) => {
        const edge = evt.target;
        const label = edge.data('edgeLabel') || '';
        const txHash = edge.data('txHash') || '';
        containerRef.current!.title = `${label}\nTx: ${txHash}`;
      });
      cy.on('mouseout', 'edge', () => {
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
            node.animate({ position: pos, duration: 300 } as unknown as cytoscape.AnimationOptions);
          }
        }
      });
      setTimeout(() => cy.fit(undefined, 40), 350);
    }, [positions]);

    const runLayout = useCallback((type?: LayoutType) => {
      const lt = type ?? layoutType;
      const nodes = Array.from(nodesRef.current.values()).map(n => ({
        id: n.address,
        label: n.label ?? undefined,
      }));
      const edges = edgesRef.current.map(e => ({
        source: e.from,
        target: e.to,
      }));
      if (nodes.length > 0) {
        computeLayout(nodes, edges, lt);
      }
    }, [computeLayout, layoutType]);

    const toggleLabels = useCallback(() => {
      const cy = cyRef.current;
      if (!cy) return;
      const next = !showLabels;
      setShowLabels(next);
      if (next) {
        cy.elements().removeClass('hidden-label');
      } else {
        cy.elements().addClass('hidden-label');
      }
    }, [showLabels]);

    const handleLayoutChange = useCallback((type: LayoutType) => {
      setLayoutType(type);
      runLayout(type);
    }, [runLayout]);

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
              hopLevel: node.hop,
              size: node.hop === 0 ? 40 : Math.max(20, 35 - node.hop * 5),
              riskColor: node.risk ? RISK_COLORS[node.risk] : undefined,
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

          let thickness = 1;
          try {
            const val = BigInt(edge.value);
            thickness = Math.max(1, Math.min(6, Number(val > 0n ? BigInt(Math.ceil(Math.log10(Number(val) + 1))) : 0n)));
          } catch { /* ignore */ }

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
              txHash: edge.tx_hash,
            },
          });
          setEdgeCount(edgesRef.current.length);
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
        setEdgeCount(0);
        cyRef.current?.elements().remove();
      },
    }));

    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden mt-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 flex-wrap gap-2">
          <span className="text-xs text-gray-400">
            {nodeCount} nodes, {edgeCount} edges
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {isComputing && (
              <span className="text-xs text-yellow-400 animate-pulse">Computing layout...</span>
            )}

            {/* Layout selector */}
            <select
              value={layoutType}
              onChange={(e) => handleLayoutChange(e.target.value as LayoutType)}
              className="text-xs bg-gray-700 text-gray-300 rounded px-2 py-1 border border-gray-600"
            >
              <option value="dagre">Hierarchical</option>
              <option value="circular">Circular</option>
            </select>

            <button
              onClick={() => runLayout()}
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
            <button
              onClick={toggleLabels}
              className={`text-xs px-2 py-1 rounded ${showLabels ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-300'} hover:bg-gray-600`}
            >
              Labels
            </button>
            <button
              onClick={() => {
                const cy = cyRef.current;
                if (!cy) return;
                cy.zoom(cy.zoom() * 1.3);
                cy.center();
              }}
              className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              +
            </button>
            <button
              onClick={() => {
                const cy = cyRef.current;
                if (!cy) return;
                cy.zoom(cy.zoom() / 1.3);
                cy.center();
              }}
              className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600"
            >
              -
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-3 py-1 border-b border-gray-700 text-xs text-gray-500">
          <span><span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />Root</span>
          <span><span className="inline-block w-2 h-2 rounded-full border-2 border-green-500 mr-1" />Low risk</span>
          <span><span className="inline-block w-2 h-2 rounded-full border-2 border-yellow-500 mr-1" />Medium</span>
          <span><span className="inline-block w-2 h-2 rounded-full border-2 border-orange-500 mr-1" />High</span>
          <span><span className="inline-block w-2 h-2 rounded-full border-2 border-red-500 mr-1" />Severe</span>
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
