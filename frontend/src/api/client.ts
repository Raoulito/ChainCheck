import type { LookupResponse, PriceEnrichRequest, PriceEnrichResponse } from '../types/api';

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
