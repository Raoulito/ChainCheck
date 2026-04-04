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
  inputs: Record<string, string>[] | null;
  outputs: Record<string, string>[] | null;
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

export interface PriceEnrichRequest {
  transactions: { token: string; date: string; tx_hash: string }[];
}

export interface PriceEnrichResponse {
  prices: Record<string, string>;
  pending: number;
  cached: number;
}

export interface LabelInfo {
  address: string;
  chain: string;
  entity_name: string;
  entity_type: string;
  source: string;
  confidence: string;
}

export interface RiskReason {
  rule: string;
  detail: string;
  severity: string;
}

export interface RiskScore {
  score: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE';
  reasons: RiskReason[];
  computed_at: string;
  stale: boolean;
}

export interface TraceRequest {
  address: string;
  chain: string;
  direction: 'forward' | 'backward';
  max_hops: number;
  min_value: string;
  trace_through_entities: boolean;
  entity_pruning_list: string[];
  max_txs_per_node: number;
}

export interface TraceJobResponse {
  job_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  stream_url: string;
}

export interface AuthResponse {
  token: string;
  user_id: string;
  email: string;
  display_name: string;
}

export interface InvestigationSummary {
  id: string;
  title: string;
  description: string | null;
  root_address: string;
  root_chain: string;
  status: string;
  created_at: string;
  updated_at: string;
  version: number;
}

export interface NoteInfo {
  id: string;
  target_type: string;
  target_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
}
