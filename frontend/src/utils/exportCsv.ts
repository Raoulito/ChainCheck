interface ExportEdge {
  from: string;
  to: string;
  value: string;
  tx_hash: string;
  token: string;
  timestamp: number;
}

interface ExportNode {
  address: string;
  label: string | null;
  risk: string | null;
  hop: number;
}

export function exportTraceCsv(
  nodes: ExportNode[],
  edges: ExportEdge[],
  rootAddress: string,
): void {
  const nodeMap = new Map<string, ExportNode>();
  for (const n of nodes) nodeMap.set(n.address, n);

  const header = 'from,from_label,to,to_label,value,token,tx_hash,timestamp,date\n';
  const rows = edges.map((e) => {
    const fromNode = nodeMap.get(e.from);
    const toNode = nodeMap.get(e.to);
    const date = new Date(e.timestamp * 1000).toISOString().split('T')[0];
    return [
      e.from,
      fromNode?.label ?? '',
      e.to,
      toNode?.label ?? '',
      e.value,
      e.token,
      e.tx_hash,
      e.timestamp,
      date,
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
  });

  const csv = header + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().split('T')[0];
  const truncAddr = rootAddress.length > 12
    ? `${rootAddress.slice(0, 8)}...${rootAddress.slice(-4)}`
    : rootAddress;
  const filename = `chainscope_trace_${truncAddr}_${dateStr}.csv`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
