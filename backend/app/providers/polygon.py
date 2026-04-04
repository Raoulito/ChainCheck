from app.config import config
from app.providers.evm_base import EvmBaseProvider


class PolygonProvider(EvmBaseProvider):
    def chain_id(self) -> str:
        return "polygon"

    def provider_name(self) -> str:
        return "polygonscan"

    def _api_base(self) -> str:
        return "https://api.polygonscan.com/api"

    def _api_key(self) -> str:
        return config.polygonscan_api_key

    def _native_token(self) -> str:
        return "MATIC"
