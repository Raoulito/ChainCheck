import dagre from 'dagre';

export interface LayoutNode {
  id: string;
  label?: string;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
}

type LayoutType = 'dagre' | 'circular';

function computeDagre(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
): Record<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    ranksep: 200,
    nodesep: 80,
    edgesep: 40,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: 100, height: 50, label: n.label ?? n.id });
  }

  // Deduplicate edges — dagre handles one edge per pair better
  const seenEdges = new Set<string>();
  for (const e of edges) {
    const key = `${e.source}->${e.target}`;
    if (seenEdges.has(key)) continue;
    seenEdges.add(key);
    if (g.hasNode(e.source) && g.hasNode(e.target)) {
      g.setEdge(e.source, e.target);
    }
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const n of nodes) {
    const node = g.node(n.id);
    if (node) {
      positions[n.id] = { x: node.x, y: node.y };
    }
  }
  return positions;
}

function computeCircular(
  nodes: LayoutNode[],
): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  const radius = Math.max(150, nodes.length * 25);
  nodes.forEach((n, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    positions[n.id] = {
      x: radius * Math.cos(angle),
      y: radius * Math.sin(angle),
    };
  });
  return positions;
}

self.onmessage = (e: MessageEvent) => {
  const { nodes, edges, layout } = e.data as {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
    layout: LayoutType;
  };

  let positions: Record<string, { x: number; y: number }>;

  switch (layout) {
    case 'circular':
      positions = computeCircular(nodes);
      break;
    case 'dagre':
    default:
      positions = computeDagre(nodes, edges);
      break;
  }

  self.postMessage({ positions } satisfies LayoutResult);
};
