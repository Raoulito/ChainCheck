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
  finalLayout: () => void;
}

const RISK_COLORS: Record<string, string> = {
  LOW: '#00d68f',
  MEDIUM: '#ffd23f',
  HIGH: '#ff8c42',
  SEVERE: '#ff3b5c',
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
    const [ctxMode, setCtxMode] = useState<'menu' | 'label'>('menu');
    const [ctxEntityName, setCtxEntityName] = useState('');
    const [ctxEntityType, setCtxEntityType] = useState('exchange');
    const [ctxConfidence, setCtxConfidence] = useState('medium');
    const [ctxSaving, setCtxSaving] = useState(false);
    const [ctxStatus, setCtxStatus] = useState<string | null>(null);
    const [ctxExisting, setCtxExisting] = useState<string | null>(null);
    const [hiddenNodes, setHiddenNodes] = useState<Set<string>>(new Set());
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
              'background-color': '#1a2236',
              label: 'data(displayLabel)',
              'font-size': '10px',
              'font-family': 'JetBrains Mono, monospace',
              color: '#8892a6',
              'text-valign': 'bottom',
              'text-margin-y': 6,
              width: 'data(size)',
              height: 'data(size)',
              'border-width': 2,
              'border-color': '#1e2a3a',
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
              'background-color': '#00d4aa33',
              'border-color': '#00d4aa',
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
              'line-color': '#1e2a3a',
              'target-arrow-color': '#1e2a3a',
              'target-arrow-shape': 'triangle',
              'curve-style': 'bezier',
              label: 'data(edgeLabel)',
              'font-size': '8px',
              'font-family': 'JetBrains Mono, monospace',
              color: '#4a5568',
              'text-rotation': 'autorotate',
            },
          },
          {
            selector: 'edge.sanctioned',
            style: {
              'line-color': '#ff3b5c',
              'target-arrow-color': '#ff3b5c',
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
        minZoom: 0.05,
        maxZoom: 4,
        textureOnViewport: true,
        hideEdgesOnViewport: false,
        hideLabelsOnViewport: false,
        pixelRatio: Math.min(window.devicePixelRatio, 2),
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
        setCtxMode('menu');
        setCtxEntityName('');
        setCtxEntityType('exchange');
        setCtxConfidence('medium');
        setCtxStatus(null);
        setCtxExisting(null);
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

      const count = Object.keys(positions).length;
      // For large graphs, skip animation to avoid hundreds of simultaneous CSS animations
      if (count > 80) {
        cy.batch(() => {
          for (const [id, pos] of Object.entries(positions)) {
            const node = cy.getElementById(id);
            if (node.length > 0) {
              node.position(pos);
            }
          }
        });
        cy.fit(undefined, 40);
      } else {
        cy.batch(() => {
          for (const [id, pos] of Object.entries(positions)) {
            const node = cy.getElementById(id);
            if (node.length > 0) {
              node.animate({ position: pos, duration: 300 } as unknown as cytoscape.AnimationOptions);
            }
          }
        });
        setTimeout(() => cy.fit(undefined, 40), 350);
      }
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

    // Debounced auto-layout: re-layout after nodes stop arriving
    const layoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastLayoutCountRef = useRef(0);
    useEffect(() => {
      if (nodeCount === 0 || nodeCount === lastLayoutCountRef.current) return;

      // Immediate layout for the very first node
      if (nodeCount === 1) {
        lastLayoutCountRef.current = nodeCount;
        runLayout();
        return;
      }

      // Scale debounce time with graph size to avoid thrashing on big traces
      const debounceMs = nodeCount > 200 ? 3000 : nodeCount > 50 ? 1500 : 800;

      if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
      layoutTimerRef.current = setTimeout(() => {
        lastLayoutCountRef.current = nodeCount;
        runLayout();
      }, debounceMs);

      return () => {
        if (layoutTimerRef.current) clearTimeout(layoutTimerRef.current);
      };
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

    const handleHideNode = useCallback((address: string) => {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(address);
      if (node.length) {
        node.connectedEdges().hide();
        node.hide();
      }
      setHiddenNodes(prev => new Set(prev).add(address));
      setCtxMenu(null);
      log(`Hidden node ${address.slice(0, 10)}...`);
    }, [log]);

    const handleShowAllNodes = useCallback(() => {
      const cy = cyRef.current;
      if (!cy) return;
      cy.elements().show();
      setHiddenNodes(new Set());
      log('All hidden nodes restored');
    }, [log]);

    const handleOpenLabelForm = useCallback(() => {
      if (!ctxMenu) return;
      setCtxMode('label');
      getLabel(ctxMenu.address)
        .then((label) => {
          if (label) {
            setCtxExisting(`${label.entity_name} (${label.entity_type}) [${label.source}]`);
            setCtxEntityName(label.entity_name);
            setCtxEntityType(label.entity_type);
            setCtxConfidence(label.confidence);
          }
        })
        .catch(() => {});
    }, [ctxMenu]);

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

    // Batch queue: accumulate nodes/edges and flush to Cytoscape periodically
    const pendingNodesRef = useRef<GraphNode[]>([]);
    const pendingEdgesRef = useRef<GraphEdge[]>([]);
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const flushPending = useCallback(() => {
      const cy = cyRef.current;
      if (!cy) return;

      const nodesToAdd = pendingNodesRef.current;
      const edgesToAdd = pendingEdgesRef.current;
      pendingNodesRef.current = [];
      pendingEdgesRef.current = [];

      if (nodesToAdd.length === 0 && edgesToAdd.length === 0) return;

      const totalElements = nodesRef.current.size;
      // For large graphs, hide edge labels to reduce rendering load
      const suppressEdgeLabels = totalElements > 150;

      cy.batch(() => {
        for (const node of nodesToAdd) {
          if (cy.getElementById(node.address).length) continue;

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
            position: { x: node.hop * 250 + 40, y: nodesRef.current.size * 60 },
          });
        }

        for (const edge of edgesToAdd) {
          const edgeId = `${edge.from}-${edge.to}-${edge.tx_hash}`;
          if (cy.getElementById(edgeId).length) continue;
          if (!cy.getElementById(edge.from).length || !cy.getElementById(edge.to).length) continue;

          let thickness = 1;
          try {
            const val = BigInt(edge.value);
            thickness = Math.max(1, Math.min(6, Number(val > 0n ? BigInt(Math.ceil(Math.log10(Number(val) + 1))) : 0n)));
          } catch { /* ignore */ }

          let edgeLabel = '';
          if (!suppressEdgeLabels) {
            try {
              const val = Number(BigInt(edge.value));
              if (edge.token === 'ETH' && val > 0) edgeLabel = `${(val / 1e18).toFixed(2)} ETH`;
              else if (edge.token === 'BTC' && val > 0) edgeLabel = `${(val / 1e8).toFixed(4)} BTC`;
              else if (val > 0) edgeLabel = `${val} ${edge.token}`;
            } catch { /* ignore */ }
          }

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
      });

      if (nodesToAdd.length > 0) {
        setNodeCount(nodesRef.current.size);
        log(`+${nodesToAdd.length} nodes (total: ${nodesRef.current.size})`);
      }
      if (edgesToAdd.length > 0) {
        setEdgeCount(edgesRef.current.length);
        log(`+${edgesToAdd.length} edges (total: ${edgesRef.current.length})`);
      }
    }, [log]);

    const scheduleFlush = useCallback(() => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushPending();
      }, 150);  // batch every 150ms
    }, [flushPending]);

    useImperativeHandle(ref, () => ({
      addNode(node: GraphNode) {
        nodesRef.current.set(node.address, node);
        const cy = cyRef.current;
        if (!cy) {
          log(`WARN: cy not initialized, cannot add node ${node.address.slice(0, 10)}`);
          return;
        }
        pendingNodesRef.current.push(node);
        scheduleFlush();
      },

      addEdges(edges: GraphEdge[]) {
        for (const edge of edges) {
          edgesRef.current.push(edge);
        }
        const cy = cyRef.current;
        if (!cy) {
          log(`WARN: cy not initialized, cannot add edges`);
          return;
        }
        pendingEdgesRef.current.push(...edges);
        scheduleFlush();
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
        pendingNodesRef.current = [];
        pendingEdgesRef.current = [];
        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
        lastLayoutCountRef.current = 0;
        setNodeCount(0);
        setEdgeCount(0);
        setHiddenNodes(new Set());
        setDebugLog([]);
        cyRef.current?.elements().remove();
        log('Graph cleared');
      },

      finalLayout() {
        // Flush any pending elements before final layout
        if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
        flushPending();
        log('Final layout triggered');
        runLayout();
      },
    }));

    return (
      <div className={`cs-card overflow-hidden ${
        fullscreen
          ? 'fixed inset-0 z-50 m-0 rounded-none'
          : 'mt-4'
      }`}>
        {/* Toolbar */}
        <div className="flex items-center justify-between px-3 py-2 flex-wrap gap-2" style={{ borderBottom: '1px solid var(--cs-border)' }}>
          <span className="text-xs font-mono" style={{ color: 'var(--cs-text-muted)' }}>
            {nodeCount} nodes, {edgeCount} edges
          </span>
          <div className="flex items-center gap-2 flex-wrap">
            {isComputing && (
              <span className="text-xs font-display" style={{ color: 'var(--cs-yellow)' }}>
                <span className="cs-live-dot inline-block mr-1" style={{ width: 6, height: 6, background: 'var(--cs-yellow)' }} />
                Computing layout...
              </span>
            )}

            <select
              value={layoutType}
              onChange={(e) => handleLayoutChange(e.target.value as LayoutType)}
              className="cs-select" style={{ padding: '4px 8px', fontSize: '11px' }}
            >
              <option value="dagre">Hierarchical</option>
              <option value="circular">Circular</option>
            </select>

            <button onClick={() => runLayout()} className="cs-btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }}>Re-layout</button>
            <button onClick={() => cyRef.current?.fit(undefined, 40)} className="cs-btn-ghost" style={{ padding: '4px 10px', fontSize: '11px' }}>Fit</button>
            <button
              onClick={toggleLabels}
              className="cs-btn-ghost"
              style={{
                padding: '4px 10px', fontSize: '11px',
                ...(showLabels ? { background: 'var(--cs-accent-dim)', color: 'var(--cs-accent)', borderColor: 'var(--cs-accent)' } : {}),
              }}
            >
              Labels
            </button>
            <button
              onClick={() => { const cy = cyRef.current; if (!cy) return; cy.zoom(cy.zoom() * 1.3); cy.center(); }}
              className="cs-btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }}
            >+</button>
            <button
              onClick={() => { const cy = cyRef.current; if (!cy) return; cy.zoom(cy.zoom() / 1.3); cy.center(); }}
              className="cs-btn-ghost" style={{ padding: '4px 8px', fontSize: '11px' }}
            >-</button>
            {hiddenNodes.size > 0 && (
              <button
                onClick={handleShowAllNodes}
                className="cs-btn-ghost"
                style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--cs-red-dim)', color: 'var(--cs-red)', borderColor: 'var(--cs-red)' }}
              >
                Show hidden ({hiddenNodes.size})
              </button>
            )}
            <button
              onClick={() => setVerbose(v => !v)}
              className="cs-btn-ghost"
              style={{
                padding: '4px 10px', fontSize: '11px',
                ...(verbose ? { background: 'var(--cs-yellow-dim)', color: 'var(--cs-yellow)', borderColor: 'var(--cs-yellow)' } : {}),
              }}
            >Debug</button>
            <button
              onClick={() => {
                setFullscreen(f => !f);
                setTimeout(() => { cyRef.current?.resize(); cyRef.current?.fit(undefined, 40); }, 50);
              }}
              className="cs-btn-ghost"
              style={{
                padding: '4px 10px', fontSize: '11px',
                ...(fullscreen ? { background: 'var(--cs-accent-dim)', color: 'var(--cs-accent)', borderColor: 'var(--cs-accent)' } : {}),
              }}
            >
              {fullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 px-3 py-1 text-xs font-display" style={{ borderBottom: '1px solid var(--cs-border)', color: 'var(--cs-text-muted)' }}>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#00d4aa' }} />Root</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ border: '2px solid #00d68f' }} />Low</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ border: '2px solid #ffd23f' }} />Medium</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ border: '2px solid #ff8c42' }} />High</span>
          <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ border: '2px solid #ff3b5c' }} />Severe</span>
        </div>

        {/* Graph container */}
        <div
          ref={containerRef}
          className="w-full"
          style={{ height: fullscreen ? 'calc(100vh - 90px)' : '500px', background: 'var(--cs-bg-deep)' }}
        />

        {/* Debug panel */}
        {verbose && (
          <div className="p-2 max-h-48 overflow-auto font-mono" style={{ borderTop: '1px solid var(--cs-border)', background: 'var(--cs-bg-base)', fontSize: '10px', color: 'var(--cs-text-muted)' }}>
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold" style={{ color: 'var(--cs-text-secondary)' }}>Debug Log ({debugLog.length})</span>
              <button onClick={() => setDebugLog([])} style={{ color: 'var(--cs-text-dim)', fontSize: '10px' }}>Clear</button>
            </div>
            {debugLog.length === 0 && <div style={{ color: 'var(--cs-text-dim)' }}>No events yet. Start a trace to see debug output.</div>}
            {debugLog.map((entry, i) => (
              <div key={i} style={{ color: entry.includes('WARN') ? 'var(--cs-yellow)' : entry.includes('ERR') ? 'var(--cs-red)' : undefined }}>
                {entry}
              </div>
            ))}
          </div>
        )}

        {/* Right-click context menu */}
        {ctxMenu && ctxMode === 'menu' && (
          <div
            className="ctx-label-menu fixed z-[100] cs-card py-1 w-48"
            style={{ left: ctxMenu.x, top: ctxMenu.y, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
          >
            <p className="font-mono px-3 py-1 truncate" style={{ fontSize: '10px', color: 'var(--cs-text-muted)', borderBottom: '1px solid var(--cs-border)' }}>
              {ctxMenu.address}
            </p>
            <button
              onClick={() => handleHideNode(ctxMenu.address)}
              className="w-full text-left text-xs font-display px-3 py-2 transition-colors"
              style={{ color: 'var(--cs-text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--cs-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Hide node
            </button>
            <button
              onClick={handleOpenLabelForm}
              className="w-full text-left text-xs font-display px-3 py-2 transition-colors"
              style={{ color: 'var(--cs-text-secondary)' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--cs-bg-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              Label node
            </button>
          </div>
        )}

        {/* Label editing form */}
        {ctxMenu && ctxMode === 'label' && (
          <div
            className="ctx-label-menu fixed z-[100] cs-card p-3 w-72"
            style={{ left: ctxMenu.x, top: ctxMenu.y, boxShadow: '0 8px 40px rgba(0,0,0,0.6)' }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold font-display" style={{ color: 'var(--cs-text-primary)' }}>
                {ctxExisting ? 'Edit Label' : 'Add Label'}
              </span>
              <button onClick={() => setCtxMenu(null)} className="text-xs" style={{ color: 'var(--cs-text-muted)' }}>X</button>
            </div>
            <p className="font-mono mb-2 truncate" style={{ fontSize: '10px', color: 'var(--cs-text-muted)' }}>
              {ctxMenu.address}
            </p>
            {ctxExisting && (
              <p className="mb-2" style={{ fontSize: '10px', color: 'var(--cs-accent)' }}>
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
              className="cs-input w-full mb-2"
              style={{ padding: '6px 10px', fontSize: '12px' }}
            />
            <div className="flex gap-2 mb-2">
              <select value={ctxEntityType} onChange={(e) => setCtxEntityType(e.target.value)} className="cs-select flex-1" style={{ padding: '4px 8px', fontSize: '11px' }}>
                {ENTITY_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
              <select value={ctxConfidence} onChange={(e) => setCtxConfidence(e.target.value)} className="cs-select" style={{ padding: '4px 8px', fontSize: '11px' }}>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCtxSave}
                disabled={ctxSaving || !ctxEntityName.trim()}
                className="cs-btn-primary"
                style={{ padding: '4px 14px', fontSize: '11px' }}
              >
                {ctxSaving ? '...' : 'Save'}
              </button>
              {ctxStatus && (
                <span className="text-xs font-display" style={{ color: ctxStatus === 'Saved' ? 'var(--cs-green)' : 'var(--cs-red)' }}>
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
