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
  g.setGraph({ rankdir: 'LR', ranksep: 120, nodesep: 60 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    g.setNode(n.id, { width: 80, height: 40, label: n.label ?? n.id });
  }
  for (const e of edges) {
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
  const radius = Math.max(100, nodes.length * 15);
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
