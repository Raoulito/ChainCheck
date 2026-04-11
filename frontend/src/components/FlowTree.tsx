import { useState, useEffect, useCallback } from 'react';
import type { GraphHandle } from './GraphView';
import { truncateAddress, formatTimestamp } from '../utils/formatters';

interface FlowNode {
  address: string;
  label: string | null;
  risk: string | null;
  hop: number;
}

interface FlowEdge {
  from: string;
  to: string;
  value: string;
  tx_hash: string;
  token: string;
  timestamp: number;
}

interface TreeNode {
  address: string;
  label: string | null;
  risk: string | null;
  hop: number;
  edges: FlowEdge[];
  children: TreeNode[];
}

interface FlowTreeProps {
  graphRef: React.RefObject<GraphHandle | null>;
  rootAddress: string;
  direction: 'forward' | 'backward';
  isStreaming: boolean;
  onAddressClick: (chain: string, address: string) => void;
  chain: string;
  minAmount?: string;
  tokenFilter?: string;
  showOnlyFinalized?: boolean;
}

function buildTree(
  nodes: FlowNode[],
  edges: FlowEdge[],
  rootAddress: string,
  direction: 'forward' | 'backward',
): TreeNode {
  const nodeMap = new Map<string, FlowNode>();
  for (const n of nodes) nodeMap.set(n.address, n);

  const adj = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    const key = direction === 'forward' ? e.from : e.to;
    if (!adj.has(key)) adj.set(key, []);
    adj.get(key)!.push(e);
  }

  const visited = new Set<string>();

  function build(address: string): TreeNode {
    visited.add(address);
    const node = nodeMap.get(address);
    const outEdges = adj.get(address) ?? [];

    const children: TreeNode[] = [];
    for (const e of outEdges) {
      const child = direction === 'forward' ? e.to : e.from;
      if (!visited.has(child)) {
        children.push(build(child));
      }
    }

    return {
      address,
      label: node?.label ?? null,
      risk: node?.risk ?? null,
      hop: node?.hop ?? 0,
      edges: outEdges,
      children,
    };
  }

  return build(rootAddress.toLowerCase());
}

function formatFlowValue(value: string, token: string): string {
  const num = parseFloat(value);
  if (isNaN(num)) return `${value} ${token}`;

  let converted = num;
  if (token === 'ETH') converted = num / 1e18;
  else if (token === 'BTC') converted = num / 1e8;

  if (converted >= 1_000_000) return `${(converted / 1_000_000).toFixed(2)}M ${token}`;
  if (converted >= 1_000) return `${(converted / 1_000).toFixed(2)}K ${token}`;
  if (converted >= 1) return `${converted.toFixed(4)} ${token}`;
  if (converted >= 0.0001) return `${converted.toFixed(6)} ${token}`;
  return `${converted.toFixed(8)} ${token}`;
}

const RISK_COLORS: Record<string, string> = {
  LOW: 'var(--cs-green)',
  MEDIUM: 'var(--cs-yellow)',
  HIGH: 'var(--cs-orange)',
  SEVERE: 'var(--cs-red)',
};

const ENTITY_BG: Record<string, { bg: string; color: string }> = {
  exchange: { bg: 'var(--cs-blue-dim)', color: 'var(--cs-blue)' },
  mixer: { bg: 'var(--cs-red-dim)', color: 'var(--cs-red)' },
  sanctioned: { bg: 'var(--cs-red-dim)', color: 'var(--cs-red)' },
  defi: { bg: 'var(--cs-purple-dim)', color: 'var(--cs-purple)' },
};

interface TreeNodeRowProps {
  node: TreeNode;
  depth: number;
  onAddressClick: (address: string) => void;
  minAmount: bigint;
  tokenFilter: string | null;
}

function TreeNodeRow({ node, depth, onAddressClick, minAmount, tokenFilter }: TreeNodeRowProps) {
  const [expanded, setExpanded] = useState(depth < 2);

  const hasChildren = node.children.length > 0;

  const totalValue = node.edges.reduce((sum, e) => {
    try { return sum + BigInt(e.value); } catch { return sum; }
  }, 0n);
  const primaryToken = node.edges[0]?.token ?? '';
  const latestTimestamp = node.edges.length > 0
    ? Math.max(...node.edges.map(e => e.timestamp))
    : 0;

  if (minAmount > 0n && totalValue < minAmount && depth > 0) return null;
  if (tokenFilter && primaryToken && primaryToken !== tokenFilter && depth > 0) return null;

  const entityStyle = ENTITY_BG[node.risk ?? ''] ?? { bg: 'var(--cs-bg-surface)', color: 'var(--cs-text-secondary)' };

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md cursor-pointer group transition-colors"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
        onMouseEnter={(e) => e.currentTarget.style.background = 'var(--cs-bg-hover)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span className="w-4 text-xs flex-shrink-0" style={{ color: 'var(--cs-text-dim)' }}>
          {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u00B7'}
        </span>

        <span className="text-xs w-6 flex-shrink-0 font-mono" style={{ color: 'var(--cs-text-dim)' }}>
          H{node.hop}
        </span>

        <button
          className="font-mono text-xs flex-shrink-0 hover:underline"
          style={{ color: 'var(--cs-accent)' }}
          onClick={(e) => { e.stopPropagation(); onAddressClick(node.address); }}
          title={node.address}
        >
          {truncateAddress(node.address, 8)}
        </button>

        {node.label && (
          <span className="text-xs px-1.5 py-0.5 rounded font-display" style={{ background: entityStyle.bg, color: entityStyle.color }}>
            {node.label}
          </span>
        )}

        {node.risk && (
          <span className="text-xs font-semibold font-display" style={{ color: RISK_COLORS[node.risk] ?? 'var(--cs-text-muted)' }}>
            {node.risk}
          </span>
        )}

        {depth > 0 && totalValue > 0n && (
          <span className="text-xs font-mono ml-auto" style={{ color: 'var(--cs-text-secondary)' }}>
            {formatFlowValue(totalValue.toString(), primaryToken)}
          </span>
        )}

        {latestTimestamp > 0 && (
          <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--cs-text-muted)' }}>
            {formatTimestamp(latestTimestamp)}
          </span>
        )}

        {node.edges.length > 1 && (
          <span className="text-xs font-mono flex-shrink-0" style={{ color: 'var(--cs-text-dim)' }}>
            ({node.edges.length} txs)
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.address}
              node={child}
              depth={depth + 1}
              onAddressClick={onAddressClick}
              minAmount={minAmount}
              tokenFilter={tokenFilter}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FlowTree({
  graphRef,
  rootAddress,
  direction,
  isStreaming,
  onAddressClick,
  chain,
  minAmount = '0',
  tokenFilter,
}: FlowTreeProps) {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [nodeCount, setNodeCount] = useState(0);

  const refreshTree = useCallback(() => {
    const graph = graphRef.current?.getGraph();
    if (!graph || graph.nodes.length === 0) return;

    const builtTree = buildTree(graph.nodes, graph.edges, rootAddress, direction);
    setTree(builtTree);
    setNodeCount(graph.nodes.length);
  }, [graphRef, rootAddress, direction]);

  useEffect(() => {
    refreshTree();
    if (!isStreaming) return;

    const interval = setInterval(refreshTree, 2000);
    return () => clearInterval(interval);
  }, [isStreaming, refreshTree]);

  if (!tree) return null;

  let minAmountBigInt = 0n;
  try { minAmountBigInt = BigInt(minAmount); } catch { /* ignore */ }

  return (
    <div className="cs-card p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold font-display" style={{ color: 'var(--cs-text-primary)' }}>
          Flow Tree <span className="font-mono font-normal" style={{ color: 'var(--cs-text-muted)' }}>({nodeCount} addresses)</span>
        </h3>
        <div className="flex items-center gap-3">
          {isStreaming && (
            <span className="flex items-center gap-1.5 text-xs font-display" style={{ color: 'var(--cs-accent)' }}>
              <span className="cs-live-dot" style={{ width: 6, height: 6 }} />
              Live
            </span>
          )}
          <button
            onClick={refreshTree}
            className="text-xs font-display transition-colors"
            style={{ color: 'var(--cs-text-muted)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'var(--cs-text-secondary)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'var(--cs-text-muted)'}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="max-h-96 overflow-y-auto">
        <TreeNodeRow
          node={tree}
          depth={0}
          onAddressClick={(addr) => onAddressClick(chain, addr)}
          minAmount={minAmountBigInt}
          tokenFilter={tokenFilter ?? null}
        />
      </div>
    </div>
  );
}
