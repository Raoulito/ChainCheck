from pydantic import BaseModel


class ChangeDetection(BaseModel):
    output_index: int
    confidence: str  # "high" | "medium" | "low"
    reasons: list[str]
    heuristics_used: list[str]


class NormalizedTx(BaseModel):
    tx_hash: str
    chain: str
    from_address: str | None
    to_address: str | None
    value: str  # Raw value string (wei/satoshi) — NEVER float
    value_human: str
    value_usd_at_time: str | None
    decimals: int
    token: str
    timestamp: int
    block: int
    confirmations: int | None
    finalized: bool
    tx_type: str  # "native" | "token" | "internal" | "contract"
    status: str  # "success" | "failed"
    spam_score: str  # "clean" | "suspected_spam" | "confirmed_spam"
    method_name: str | None
    inputs: list[dict] | None  # BTC only
    outputs: list[dict] | None  # BTC only
    fee: str | None
    change_output: ChangeDetection | None


class AddressStats(BaseModel):
    total_received: str
    total_sent: str
    balance: str
    balance_unconfirmed: str
    tx_count: int
    first_seen: int | None
    last_seen: int | None


class LookupResponse(BaseModel):
    address: str
    chain: str
    transactions: list[NormalizedTx]
    total: int
    page: int
    per_page: int
    spam_filtered: int
    failed_filtered: int
    dust_filtered: int
    stats: AddressStats
    warnings: list[str]


class PriceQuery(BaseModel):
    token: str
    date: str
    tx_hash: str


class PriceEnrichRequest(BaseModel):
    transactions: list[PriceQuery]


class PriceEnrichResponse(BaseModel):
    prices: dict[str, str]
    pending: int
    cached: int


class LabelInfo(BaseModel):
    address: str
    chain: str
    entity_name: str
    entity_type: str
    source: str
    confidence: str


class RiskReason(BaseModel):
    rule: str
    detail: str
    severity: str


class RiskScore(BaseModel):
    score: str  # "LOW" | "MEDIUM" | "HIGH" | "SEVERE"
    reasons: list[RiskReason]
    computed_at: str
    stale: bool
