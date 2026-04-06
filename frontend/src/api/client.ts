import type { LookupResponse, PriceEnrichRequest, PriceEnrichResponse, LabelInfo, RiskScore } from '../types/api';
import { API_BASE } from './config';

export async function lookupAddress(
  chain: string,
  address: string,
  page: number = 1,
  perPage: number = 50
): Promise<LookupResponse> {
  const res = await fetch(
    `${API_BASE}/api/lookup/${chain}/${address}?page=${page}&per_page=${perPage}`
  );
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || `Lookup failed: ${res.status}`);
  }
  return res.json();
}

export async function enrichPrices(
  body: PriceEnrichRequest
): Promise<PriceEnrichResponse> {
  const res = await fetch(`${API_BASE}/api/prices/enrich`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Price enrichment failed: ${res.status}`);
  return res.json();
}

export async function batchLabels(
  addresses: string[]
): Promise<{ labels: Record<string, LabelInfo | null> }> {
  const res = await fetch(`${API_BASE}/api/labels/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ addresses }),
  });
  if (!res.ok) throw new Error(`Label batch failed: ${res.status}`);
  return res.json();
}

export async function searchLabels(
  entity: string
): Promise<LabelInfo[]> {
  const res = await fetch(`${API_BASE}/api/labels/search?entity=${encodeURIComponent(entity)}`);
  if (!res.ok) throw new Error(`Label search failed: ${res.status}`);
  return res.json();
}

export async function getRiskScore(
  address: string,
  chain: string = 'eth'
): Promise<RiskScore> {
  const res = await fetch(`${API_BASE}/api/risk/${address}?chain=${chain}`);
  if (!res.ok) throw new Error(`Risk score failed: ${res.status}`);
  return res.json();
}

export async function getExposure(
  address: string,
  chain: string = 'eth'
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/risk/${address}/exposure?chain=${chain}`);
  if (!res.ok) throw new Error(`Exposure failed: ${res.status}`);
  return res.json();
}

export async function getCluster(
  address: string
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/api/cluster/${address}`);
  if (!res.ok) throw new Error(`Cluster failed: ${res.status}`);
  return res.json();
}
