from decimal import Decimal
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # API keys
    etherscan_api_key: str = ""
    bscscan_api_key: str = ""
    polygonscan_api_key: str = ""
    helius_api_key: str = ""
    coingecko_api_key: str = ""

    # Database
    database_url: str = "sqlite+aiosqlite:///./chainscope.db"

    # Logging
    log_level: str = "INFO"

    # Trace limits
    trace_max_nodes: int = 500
    trace_max_api_calls: int = 200
    trace_max_txs_per_node: int = 50

    # Outbound rate limits (requests per second)
    etherscan_rate_limit: float = 4.5
    blockstream_rate_limit: float = 8.0

    # Finality thresholds (blocks)
    eth_finality_blocks: int = 64
    btc_finality_blocks: int = 6

    # Dust floors (raw units as strings for Decimal conversion)
    dust_floor_eth_wei: str = "10000000000000000"
    dust_floor_btc_sat: str = "10000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    @property
    def finality(self) -> dict[str, int]:
        return {
            "eth": self.eth_finality_blocks,
            "btc": self.btc_finality_blocks,
        }

    @property
    def dust_floor(self) -> dict[str, Decimal]:
        return {
            "eth": Decimal(self.dust_floor_eth_wei),
            "btc": Decimal(self.dust_floor_btc_sat),
        }

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


config = Settings()
