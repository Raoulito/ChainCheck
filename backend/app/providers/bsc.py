from app.config import config
from app.providers.evm_base import EvmBaseProvider


class BscProvider(EvmBaseProvider):
    def chain_id(self) -> str:
        return "bsc"

    def provider_name(self) -> str:
        return "bscscan"

    def _chain_id_num(self) -> int:
        return 56  # BNB Smart Chain

    def _api_key(self) -> str:
        return config.bscscan_api_key

    def _native_token(self) -> str:
        return "BNB"
