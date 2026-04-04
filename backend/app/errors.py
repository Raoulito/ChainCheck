class ProviderError(Exception):
    """Raised when a blockchain data provider returns an error."""

    def __init__(self, provider: str, message: str, status_code: int | None = None):
        self.provider = provider
        self.status_code = status_code
        super().__init__(f"[{provider}] {message}")


class RateLimitError(ProviderError):
    """Raised when a provider returns 429 — indicates limiter misconfiguration."""

    def __init__(self, provider: str):
        super().__init__(provider, "429 received — outbound limiter may be too fast", 429)


class ValidationError(Exception):
    """Raised for invalid input (addresses, chains, etc.)."""

    def __init__(self, message: str):
        super().__init__(message)
