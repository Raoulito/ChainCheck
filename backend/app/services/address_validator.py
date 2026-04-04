import re

from app.errors import ValidationError

# BTC: Legacy (1...), P2SH (3...), Bech32 (bc1q...), Taproot (bc1p...)
BTC_PATTERN = re.compile(
    r"^(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90})$"
)

# ETH: 0x followed by 40 hex chars
ETH_PATTERN = re.compile(r"^0x[0-9a-fA-F]{40}$")

SUPPORTED_CHAINS = {"btc", "eth"}


def detect_chain(address: str) -> str:
    """Auto-detect chain from address format."""
    if ETH_PATTERN.match(address):
        return "eth"
    if BTC_PATTERN.match(address):
        return "btc"
    raise ValidationError(f"Cannot detect chain for address: {address}")


def validate_address(chain: str, address: str) -> None:
    """Validate that an address matches the expected format for a chain."""
    if chain not in SUPPORTED_CHAINS:
        raise ValidationError(f"Unsupported chain: {chain}. Supported: {', '.join(SUPPORTED_CHAINS)}")

    if chain == "eth" and not ETH_PATTERN.match(address):
        raise ValidationError(f"Invalid Ethereum address: {address}")

    if chain == "btc" and not BTC_PATTERN.match(address):
        raise ValidationError(f"Invalid Bitcoin address: {address}")
