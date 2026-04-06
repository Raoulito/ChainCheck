from aiolimiter import AsyncLimiter

from app.config import config

LIMITERS: dict[str, AsyncLimiter] = {
    "etherscan": AsyncLimiter(config.etherscan_rate_limit, 1),
    "bscscan": AsyncLimiter(config.etherscan_rate_limit, 1),
    "polygonscan": AsyncLimiter(config.etherscan_rate_limit, 1),
    "mempool": AsyncLimiter(8.0, 1),
    "blockstream": AsyncLimiter(min(config.blockstream_rate_limit, 3.0), 1),
    "helius": AsyncLimiter(8.0, 1),
    "trongrid": AsyncLimiter(12.0, 1),
    "coingecko": AsyncLimiter(0.4, 1),
}
