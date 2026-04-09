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

  // Group edges by source
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

  // Values are always in smallest unit (wei/satoshi) — convert first
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
  LOW: 'text-green-400',
  MEDIUM: 'text-yellow-400',
  HIGH: 'text-orange-400',
  SEVERE: 'text-red-400',
};

const ENTITY_COLORS: Record<string, string> = {
  exchange: 'bg-blue-900/50 text-blue-300',
  mixer: 'bg-red-900/50 text-red-300',
  sanctioned: 'bg-red-800/70 text-red-200',
  defi: 'bg-purple-900/50 text-purple-300',
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

  // Aggregate edge values for this node
  const totalValue = node.edges.reduce((sum, e) => {
    try { return sum + BigInt(e.value); } catch { return sum; }
  }, 0n);
  const primaryToken = node.edges[0]?.token ?? '';
  const latestTimestamp = node.edges.length > 0
    ? Math.max(...node.edges.map(e => e.timestamp))
    : 0;

  // Apply filters
  if (minAmount > 0n && totalValue < minAmount && depth > 0) return null;
  if (tokenFilter && primaryToken && primaryToken !== tokenFilter && depth > 0) return null;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-700/50 rounded cursor-pointer group"
        style={{ paddingLeft: `${depth * 24 + 8}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        {/* Expand/collapse toggle */}
        <span className="w-4 text-gray-500 text-xs flex-shrink-0">
          {hasChildren ? (expanded ? '\u25BC' : '\u25B6') : '\u00B7'}
        </span>

        {/* Hop indicator */}
        <span className="text-gray-600 text-xs w-6 flex-shrink-0">
          H{node.hop}
        </span>

        {/* Address */}
        <button
          className="font-mono text-xs text-blue-400 hover:text-blue-300 hover:underline flex-shrink-0"
          onClick={(e) => { e.stopPropagation(); onAddressClick(node.address); }}
          title={node.address}
        >
          {truncateAddress(node.address, 8)}
        </button>

        {/* Label */}
        {node.label && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${ENTITY_COLORS[node.risk ?? ''] ?? 'bg-gray-700 text-gray-300'}`}>
            {node.label}
          </span>
        )}

        {/* Risk */}
        {node.risk && (
          <span className={`text-xs font-medium ${RISK_COLORS[node.risk] ?? 'text-gray-400'}`}>
            {node.risk}
          </span>
        )}

        {/* Value */}
        {depth > 0 && totalValue > 0n && (
          <span className="text-xs text-gray-300 ml-auto">
            {formatFlowValue(totalValue.toString(), primaryToken)}
          </span>
        )}

        {/* Timestamp */}
        {latestTimestamp > 0 && (
          <span className="text-xs text-gray-500 flex-shrink-0">
            {formatTimestamp(latestTimestamp)}
          </span>
        )}

        {/* Edge count */}
        {node.edges.length > 1 && (
          <span className="text-xs text-gray-600 flex-shrink-0">
            ({node.edges.length} txs)
          </span>
        )}
      </div>

      {/* Children */}
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

  // Refresh tree every 2 seconds during streaming, once after completion
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
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-200">
          Flow Tree ({nodeCount} addresses)
        </h3>
        <div className="flex items-center gap-2">
          {isStreaming && (
            <span className="text-xs text-green-400 animate-pulse">Live</span>
          )}
          <button
            onClick={refreshTree}
            className="text-xs text-gray-400 hover:text-gray-200"
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
