import type { LookupResponse, PriceEnrichRequest, PriceEnrichResponse, LabelInfo } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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
