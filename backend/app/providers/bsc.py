from app.config import config
from app.providers.evm_base import EvmBaseProvider


class BscProvider(EvmBaseProvider):
    def chain_id(self) -> str:
        return "bsc"

    def provider_name(self) -> str:
        return "bscscan"

    def _api_base(self) -> str:
        return "https://api.bscscan.com/api"

    def _api_key(self) -> str:
        return config.bscscan_api_key

    def _native_token(self) -> str:
        return "BNB"
