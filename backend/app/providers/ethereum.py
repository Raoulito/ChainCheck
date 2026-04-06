from app.config import config
from app.providers.evm_base import EvmBaseProvider


class EthereumProvider(EvmBaseProvider):
    def chain_id(self) -> str:
        return "eth"

    def provider_name(self) -> str:
        return "etherscan"

    def _chain_id_num(self) -> int:
        return 1  # Ethereum Mainnet

    def _api_key(self) -> str:
        return config.etherscan_api_key

    def _native_token(self) -> str:
        return "ETH"
