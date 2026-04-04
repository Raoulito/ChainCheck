# API SCHEMA CONTRACTS

> **This file is the single source of truth for all field names crossing the API boundary.**
> Both the Python backend (Pydantic) and TypeScript frontend MUST obey these exact names.
> The API speaks `snake_case`. The frontend reads `snake_case`. No camelCase conversion.
> If a field name exists here, it is canonical. If it doesn't exist here, it doesn't exist.

---

## STEP 1 — Address Lookup Contract

### Endpoint

```
GET /api/lookup/{chain}/{address}
```

- `chain`: `"btc"` | `"eth"` (future: `"bsc"`, `"polygon"`, `"tron"`, `"sol"`)
- `address`: validated blockchain address string
- Returns: `LookupResponse`

---

### 1. Python Pydantic Models (Backend)

```python
from pydantic import BaseModel


class AddressStats(BaseModel):
    total_received: str             # Raw value string (Decimal-safe)
    total_sent: str                 # Raw value string (Decimal-safe)
    balance: str                    # Raw value string (Decimal-safe)
    balance_unconfirmed: str        # Txs below finality threshold
    tx_count: int
    first_seen: int | None          # Unix timestamp
    last_seen: int | None           # Unix timestamp


class ChangeDetection(BaseModel):
    output_index: int               # Which output is suspected change
    confidence: str                 # "high" | "medium" | "low"
    reasons: list[str]              # Human-readable explanation per heuristic
    heuristics_used: list[str]      # "first_time_seen" | "round_number" | "script_type"


class NormalizedTx(BaseModel):
    tx_hash: str
    chain: str                      # "btc" | "eth" | "bsc" | ...
    from_address: str | None        # None for BTC UTXO (use inputs)
    to_address: str | None          # None for BTC UTXO (use outputs)
    value: str                      # Raw string (wei/satoshi) — NEVER float
    value_human: str                # Display string ("1.5")
    value_usd_at_time: str | None   # Always null on initial lookup (async enrichment)
    decimals: int                   # 18 for ETH, 8 for BTC
    token: str                      # "ETH", "BTC", "USDT", etc.
    timestamp: int                  # Unix seconds
    block: int
    confirmations: int | None       # Computed: latest_block - tx_block
    finalized: bool                 # True if confirmations >= finality threshold
    tx_type: str                    # "native" | "token" | "internal" | "contract"
    status: str                     # "success" | "failed"
    spam_score: str                 # "clean" | "suspected_spam" | "confirmed_spam"
    method_name: str | None         # Decoded from 4byte local DB, or null
    inputs: list[dict] | None       # BTC only: [{"address": "...", "value": "..."}]
    outputs: list[dict] | None      # BTC only: [{"address": "...", "value": "..."}]
    fee: str | None                 # Raw string (satoshi/wei)
    change_output: ChangeDetection | None  # BTC only


class LookupResponse(BaseModel):
    address: str
    chain: str
    transactions: list[NormalizedTx]
    total: int                      # Total tx count (before filtering)
    page: int
    per_page: int
    spam_filtered: int              # Count of txs hidden by spam filter
    failed_filtered: int            # Count of txs hidden by failed filter
    dust_filtered: int              # Count of txs hidden by dust floor
    stats: AddressStats             # Computed from successful, non-spam, non-dust txs only
    warnings: list[str]             # Partial-data warnings (e.g., "tokentx timed out")
```

---

### 2. TypeScript Interfaces (Frontend)

```typescript
export interface AddressStats {
  total_received: string;
  total_sent: string;
  balance: string;
  balance_unconfirmed: string;
  tx_count: number;
  first_seen: number | null;
  last_seen: number | null;
}

export interface ChangeDetection {
  output_index: number;
  confidence: string;
  reasons: string[];
  heuristics_used: string[];
}

export interface NormalizedTx {
  tx_hash: string;
  chain: string;
  from_address: string | null;
  to_address: string | null;
  value: string;
  value_human: string;
  value_usd_at_time: string | null;
  decimals: number;
  token: string;
  timestamp: number;
  block: number;
  confirmations: number | null;
  finalized: boolean;
  tx_type: string;
  status: string;
  spam_score: string;
  method_name: string | null;
  inputs: Record<string, any>[] | null;
  outputs: Record<string, any>[] | null;
  fee: string | null;
  change_output: ChangeDetection | null;
}

export interface LookupResponse {
  address: string;
  chain: string;
  transactions: NormalizedTx[];
  total: number;
  page: number;
  per_page: number;
  spam_filtered: number;
  failed_filtered: number;
  dust_filtered: number;
  stats: AddressStats;
  warnings: string[];
}
```

---

### 3. API Client Function (Frontend)

```typescript
// src/api/client.ts
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
  if (!res.ok) throw new Error(`Lookup failed: ${res.status}`);
  return res.json();
}
```

---

### 4. TanStack Query Hook (Frontend)

```typescript
// Used in Explorer.tsx
import { useQuery } from '@tanstack/react-query';
import { lookupAddress } from '../api/client';

export function useLookup(chain: string | null, address: string | null, page: number) {
  return useQuery({
    queryKey: ['lookup', chain, address, page],
    queryFn: () => lookupAddress(chain!, address!, page),
    enabled: !!chain && !!address,
    staleTime: 5 * 60 * 1000,
  });
}
```

---

### 5. Field Name Rules

| Rule | Detail |
|------|--------|
| **Casing** | All fields are `snake_case`. No camelCase anywhere in the API. |
| **Values** | All blockchain values (amounts, fees, balances) are **strings**, never floats or numbers. |
| **Nullability** | `None` (Python) = `null` (TypeScript). Explicitly typed on both sides. |
| **Lists** | Python `list[X]` = TypeScript `X[]`. |
| **Dicts** | Python `list[dict]` = TypeScript `Record<string, any>[]`. |
| **Enums** | Passed as plain strings, not enum objects. Validated by Pydantic on the backend. |
| **Timestamps** | Unix seconds as `int` / `number`. Never ISO strings in the API response. |
| **USD values** | Always `null` on initial lookup. Populated async via `POST /api/prices/enrich`. |

---

## FUTURE STEPS (contracts to be added here as each step begins)

- Step 3: `LabelInfo`, `BatchLabelRequest`, `BatchLabelResponse`
- Step 4: `RiskScore`, `RiskReason`, `ExposureReport`, `ClusterInfo`
- Step 5: `TraceRequest`, `TraceJobResponse`, SSE delta event types
- Step 10: `Investigation`, `Note`, `AuditLogEntry`
