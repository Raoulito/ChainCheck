"""Provider registry with auto-detection from address format."""
from app.providers.base import ChainProvider
from app.providers.bitcoin import BitcoinProvider
from app.providers.ethereum import EthereumProvider
from app.providers.bsc import BscProvider
from app.providers.polygon import PolygonProvider

# Chain ID → Provider class
PROVIDER_REGISTRY: dict[str, type[ChainProvider]] = {
    "btc": BitcoinProvider,
    "eth": EthereumProvider,
    "bsc": BscProvider,
    "polygon": PolygonProvider,
}

# EVM chains share the 0x address format, need disambiguation
EVM_CHAINS = {"eth", "bsc", "polygon"}


def get_provider(chain: str) -> ChainProvider:
    """Instantiate a provider for the given chain."""
    cls = PROVIDER_REGISTRY.get(chain)
    if not cls:
        raise ValueError(f"Unsupported chain: {chain}")
    return cls()


def supported_chains() -> list[str]:
    """Return list of supported chain IDs."""
    return list(PROVIDER_REGISTRY.keys())
