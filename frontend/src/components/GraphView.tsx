import { forwardRef, useImperativeHandle, useRef, useEffect, useState, useCallback } from 'react';
import cytoscape from 'cytoscape';
import cytoscapeDagre from 'cytoscape-dagre';
import { useGraphLayout } from '../hooks/useGraphLayout';
import { createLabel, getLabel } from '../api/client';

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

const ENTITY_TYPES = [
  'exchange', 'defi', 'mixer', 'sanctioned', 'darknet',
  'gambling', 'scam', 'service', 'mining_pool', 'other',
];

interface ContextMenu {
  x: number;
  y: number;
  address: string;
}

interface GraphViewProps {
  onAddressClick?: (address: string) => void;
  chain?: string;
}

export const GraphView = forwardRef<GraphHandle, GraphViewProps>(
  function GraphView({ onAddressClick, chain }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const cyRef = useRef<cytoscape.Core | null>(null);
    const nodesRef = useRef<Map<string, GraphNode>>(new Map());
    const edgesRef = useRef<GraphEdge[]>([]);
    const onAddressClickRef = useRef(onAddressClick);
    const [nodeCount, setNodeCount] = useState(0);
    const [edgeCount, setEdgeCount] = useState(0);
    const [showLabels, setShowLabels] = useState(true);
    const [layoutType, setLayoutType] = useState<LayoutType>('dagre');
    const [verbose, setVerbose] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [debugLog, setDebugLog] = useState<string[]>([]);
    const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
    const [ctxEntityName, setCtxEntityName] = useState('');
    const [ctxEntityType, setCtxEntityType] = useState('exchange');
    const [ctxConfidence, setCtxConfidence] = useState('medium');
    const [ctxSaving, setCtxSaving] = useState(false);
    const [ctxStatus, setCtxStatus] = useState<string | null>(null);
    const [ctxExisting, setCtxExisting] = useState<string | null>(null);
    const { positions, isComputing, computeLayout } = useGraphLayout();

    // Keep callback ref in sync without re-running the effect
    useEffect(() => {
      onAddressClickRef.current = onAddressClick;
    }, [onAddressClick]);

    // Escape key exits fullscreen / closes context menu
    useEffect(() => {
      const handler = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          if (ctxMenu) setCtxMenu(null);
          else if (fullscreen) setFullscreen(false);
        }
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [fullscreen, ctxMenu]);

    // Prevent browser context menu on graph container
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const handler = (e: MouseEvent) => e.preventDefault();
      el.addEventListener('contextmenu', handler);
      return () => el.removeEventListener('contextmenu', handler);
    }, []);

    // Close context menu on outside click
    useEffect(() => {
      if (!ctxMenu) return;
      const handler = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('.ctx-label-menu')) setCtxMenu(null);
      };
      window.addEventListener('mousedown', handler);
      return () => window.removeEventListener('mousedown', handler);
    }, [ctxMenu]);

    const log = useCallback((msg: string) => {
      setDebugLog(prev => {
        const entry = `[${new Date().toLocaleTimeString()}] ${msg}`;
        const next = [...prev, entry];
        return next.length > 100 ? next.slice(-100) : next;
      });
    }, []);

    // Initialize Cytoscape once
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

      // Click handler — uses ref to avoid stale closure
      cy.on('tap', 'node', (evt) => {
        const addr = evt.target.data('id');
        if (addr && onAddressClickRef.current) onAddressClickRef.current(addr);
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

      // Right-click context menu on nodes
      cy.on('cxttap', 'node', (evt) => {
        const node = evt.target;
        const addr = node.data('id');
        const pos = evt.renderedPosition || evt.position;
        const rect = containerRef.current!.getBoundingClientRect();
        setCtxMenu({
          x: rect.left + pos.x,
          y: rect.top + pos.y,
          address: addr,
        });
        setCtxEntityName('');
        setCtxEntityType('exchange');
        setCtxConfidence('medium');
        setCtxStatus(null);
        setCtxExisting(null);
        // Fetch existing label
        getLabel(addr)
          .then((label) => {
            if (label) {
              setCtxExisting(`${label.entity_name} (${label.entity_type}) [${label.source}]`);
              setCtxEntityName(label.entity_name);
              setCtxEntityType(label.entity_type);
              setCtxConfidence(label.confidence);
            }
          })
          .catch(() => {});
      });

      // Close context menu on background click/tap
      cy.on('tap', (evt) => {
        if (evt.target === cy) setCtxMenu(null);
      });

      cyRef.current = cy;

      return () => {
        cy.destroy();
        cyRef.current = null;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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

    // Auto re-layout when node count crosses thresholds during streaming
    const lastLayoutCountRef = useRef(0);
    useEffect(() => {
      if (nodeCount > 0 && nodeCount !== lastLayoutCountRef.current) {
        // Layout at 1, 5, 10, 20, 50, 100... or every 10 nodes after 10
        const thresholds = [1, 3, 5, 10, 20, 50, 100, 200, 500];
        const shouldLayout = thresholds.includes(nodeCount) ||
          (nodeCount > 10 && nodeCount % 10 === 0);
        if (shouldLayout) {
          lastLayoutCountRef.current = nodeCount;
          runLayout();
        }
      }
    }, [nodeCount, runLayout]);

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

    const handleCtxSave = useCallback(async () => {
      if (!ctxMenu || !ctxEntityName.trim()) return;
      setCtxSaving(true);
      setCtxStatus(null);
      try {
        const label = await createLabel(
          ctxMenu.address, chain || 'eth', ctxEntityName.trim(), ctxEntityType, ctxConfidence,
        );
        // Update the node label in the graph
        const cy = cyRef.current;
        if (cy) {
          const node = cy.getElementById(ctxMenu.address);
          if (node.length) {
            node.data('displayLabel', label.entity_name);
            node.data('labelText', label.entity_name);
          }
        }
        // Update internal node ref
        const nodeData = nodesRef.current.get(ctxMenu.address);
        if (nodeData) nodeData.label = label.entity_name;
        setCtxStatus('Saved');
        setTimeout(() => setCtxMenu(null), 600);
      } catch (err) {
        setCtxStatus(err instanceof Error ? err.message : 'Failed');
      } finally {
        setCtxSaving(false);
      }
    }, [ctxMenu, ctxEntityName, ctxEntityType, ctxConfidence, chain]);

    useImperativeHandle(ref, () => ({
      addNode(node: GraphNode) {
        nodesRef.current.set(node.address, node);
        const cy = cyRef.current;
        if (!cy) {
          log(`WARN: cy not initialized, cannot add node ${node.address.slice(0, 10)}`);
          return;
        }
        if (cy.getElementById(node.address).length) {
          log(`SKIP: node ${node.address.slice(0, 10)} already exists`);
          return;
        }

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
          // Place based on hop rank so nodes land in the correct column before layout runs
          position: { x: node.hop * 250 + 40, y: nodesRef.current.size * 60 },
        });
        const newCount = nodesRef.current.size;
        setNodeCount(newCount);
        log(`+node hop=${node.hop} ${node.address.slice(0, 10)}... (total: ${newCount})`);
      },

      addEdges(edges: GraphEdge[]) {
        for (const edge of edges) {
          edgesRef.current.push(edge);
          const cy = cyRef.current;
          if (!cy) {
            log(`WARN: cy not initialized, cannot add edge`);
            continue;
          }

          const edgeId = `${edge.from}-${edge.to}-${edge.tx_hash}`;
          if (cy.getElementById(edgeId).length) continue;

          // Check that source and target nodes exist
          if (!cy.getElementById(edge.from).length) {
            log(`WARN: edge source ${edge.from.slice(0, 10)} not found, skipping edge`);
            continue;
          }
          if (!cy.getElementById(edge.to).length) {
            log(`WARN: edge target ${edge.to.slice(0, 10)} not found, skipping edge`);
            continue;
          }

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
        }
        setEdgeCount(edgesRef.current.length);
        log(`+${edges.length} edges (total: ${edgesRef.current.length})`);
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
        lastLayoutCountRef.current = 0;
        setNodeCount(0);
        setEdgeCount(0);
        setDebugLog([]);
        cyRef.current?.elements().remove();
        log('Graph cleared');
      },
    }));

    return (
      <div className={`bg-gray-800 border border-gray-700 rounded-lg overflow-hidden ${
        fullscreen
          ? 'fixed inset-0 z-50 m-0 rounded-none'
          : 'mt-4'
      }`}>
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
            <button
              onClick={() => setVerbose(v => !v)}
              className={`text-xs px-2 py-1 rounded ${verbose ? 'bg-yellow-700 text-white' : 'bg-gray-700 text-gray-300'} hover:bg-gray-600`}
            >
              Debug
            </button>
            <button
              onClick={() => {
                setFullscreen(f => !f);
                // Re-fit after transition
                setTimeout(() => {
                  cyRef.current?.resize();
                  cyRef.current?.fit(undefined, 40);
                }, 50);
              }}
              className={`text-xs px-2 py-1 rounded ${fullscreen ? 'bg-green-700 text-white' : 'bg-gray-700 text-gray-300'} hover:bg-gray-600`}
            >
              {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
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
          style={{ height: fullscreen ? 'calc(100vh - 90px)' : '500px' }}
        />

        {/* Debug panel */}
        {verbose && (
          <div className="border-t border-gray-700 bg-gray-950 p-2 max-h-48 overflow-auto font-mono text-[10px] text-gray-500">
            <div className="flex justify-between items-center mb-1">
              <span className="text-gray-400 font-bold">Debug Log ({debugLog.length})</span>
              <button
                onClick={() => setDebugLog([])}
                className="text-gray-600 hover:text-gray-400 text-[10px]"
              >
                Clear
              </button>
            </div>
            {debugLog.length === 0 && <div className="text-gray-600">No events yet. Start a trace to see debug output.</div>}
            {debugLog.map((entry, i) => (
              <div key={i} className={entry.includes('WARN') ? 'text-yellow-500' : entry.includes('ERR') ? 'text-red-500' : ''}>
                {entry}
              </div>
            ))}
          </div>
        )}

        {/* Right-click label context menu */}
        {ctxMenu && (
          <div
            className="ctx-label-menu fixed z-[100] bg-gray-800 border border-gray-600 rounded-lg shadow-xl p-3 w-72"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-white">
                {ctxExisting ? 'Edit Label' : 'Add Label'}
              </span>
              <button
                onClick={() => setCtxMenu(null)}
                className="text-gray-400 hover:text-white text-xs"
              >
                X
              </button>
            </div>
            <p className="text-[10px] text-gray-500 font-mono mb-2 truncate">
              {ctxMenu.address}
            </p>
            {ctxExisting && (
              <p className="text-[10px] text-blue-400 mb-2">
                Current: {ctxExisting}
              </p>
            )}
            <input
              type="text"
              placeholder="Entity name"
              value={ctxEntityName}
              onChange={(e) => setCtxEntityName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCtxSave(); }}
              autoFocus
              className="w-full bg-gray-900 border border-gray-600 rounded px-2 py-1 text-xs text-white mb-2 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2 mb-2">
              <select
                value={ctxEntityType}
                onChange={(e) => setCtxEntityType(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-600 rounded px-1 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <select
                value={ctxConfidence}
                onChange={(e) => setCtxConfidence(e.target.value)}
                className="bg-gray-900 border border-gray-600 rounded px-1 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
              >
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCtxSave}
                disabled={ctxSaving || !ctxEntityName.trim()}
                className="text-xs px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-white disabled:opacity-50"
              >
                {ctxSaving ? '...' : 'Save'}
              </button>
              {ctxStatus && (
                <span className={`text-xs ${ctxStatus === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
                  {ctxStatus}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    );
  },
);
