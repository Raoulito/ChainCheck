import type { TraceRequest, TraceJobResponse } from '../types/api';
import { API_BASE } from './config';

export async function startTrace(body: TraceRequest): Promise<TraceJobResponse> {
  const res = await fetch(`${API_BASE}/api/trace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Trace failed: ${res.status}`);
  }
  return res.json();
}

export async function cancelTrace(jobId: string): Promise<void> {
  await fetch(`${API_BASE}/api/trace/${jobId}/cancel`, { method: 'POST' });
}

export function createTraceStream(jobId: string): EventSource {
  return new EventSource(`${API_BASE}/api/trace/${jobId}/stream`);
}
