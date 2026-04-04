import csv
import io
import logging
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.label import Label

logger = logging.getLogger(__name__)


async def import_ofac_sdn(session: AsyncSession) -> int:
    """
    Import OFAC SDN list (Specially Designated Nationals).
    Downloads the CSV and extracts cryptocurrency addresses.
    Returns the count of imported labels.
    """
    url = "https://www.treasury.gov/ofac/downloads/sdn.csv"
    count = 0
    now = datetime.now(timezone.utc).isoformat()

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning("OFAC SDN download failed: %d", response.status_code)
                return 0

            reader = csv.reader(io.StringIO(response.text))
            for row in reader:
                if len(row) < 12:
                    continue

                # OFAC SDN CSV has "Digital Currency Address" in remarks
                remarks = " ".join(row[11:]) if len(row) > 11 else ""
                addresses = _extract_crypto_addresses(remarks)

                entity_name = row[1].strip() if len(row) > 1 else "Unknown"

                for addr, chain in addresses:
                    existing = await session.execute(
                        select(Label).where(Label.address == addr.lower())
                    )
                    if existing.scalar_one_or_none():
                        continue

                    label = Label(
                        address=addr.lower(),
                        chain=chain,
                        entity_name=entity_name,
                        entity_type="sanctioned",
                        source="ofac_sdn",
                        confidence="high",
                        updated_at=now,
                    )
                    session.add(label)
                    count += 1

            await session.commit()

    except Exception as exc:
        logger.error("OFAC SDN import failed: %s", exc)
        await session.rollback()

    logger.info("OFAC SDN import: added %d addresses", count)
    return count


async def import_etherscan_labels(session: AsyncSession) -> int:
    """
    Import known address labels from Etherscan's public label cloud.
    Since Etherscan doesn't provide a bulk API, we use well-known addresses.
    Returns the count of imported labels.
    """
    known_labels = [
        ("0x28c6c06298d514db089934071355e5743bf21d60", "Binance", "exchange"),
        ("0x21a31ee1afc51d94c2efccaa2092ad1028285549", "Binance", "exchange"),
        ("0xdfd5293d8e347dfe59e90efd55b2956a1343963d", "Binance", "exchange"),
        ("0x56eddb7aa87536c09ccc2793473599fd21a8b17f", "Binance", "exchange"),
        ("0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be", "Binance", "exchange"),
        ("0xbe0eb53f46cd790cd13851d5eff43d12404d33e8", "Binance", "exchange"),
        ("0x2910543af39aba0cd09dbb2d50200b3e800a63d2", "Kraken", "exchange"),
        ("0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0", "Kraken", "exchange"),
        ("0xae2d4617c862309a3d75a0ffb358c7a5009c673f", "Kraken", "exchange"),
        ("0x1151314c646ce4e0efd76d1af4760ae66a9fe30f", "Bitfinex", "exchange"),
        ("0x742d35cc6634c0532925a3b844bc9e7595f2bd1e", "Bitfinex", "exchange"),
        ("0x876eabf441b2ee5b5b0554fd502a8e0600950cfa", "Bitfinex", "exchange"),
        ("0xa910f92acdaf488fa6ef02174fb86208ad7722ba", "OKX", "exchange"),
        ("0x6cc5f688a315f3dc28a7781717a9a798a59fda7b", "OKX", "exchange"),
        ("0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", "Coinbase", "exchange"),
        ("0x71660c4005ba85c37ccec55d0c4493e66fe775d3", "Coinbase", "exchange"),
        ("0xa090e606e30bd747d4e6245a1517ebe430f0057e", "Coinbase", "exchange"),
        ("0xd9dab021e74ecf475788ed7b61356bb3589ee2ad", "Tornado Cash", "mixer"),
        ("0x722122df12d4e14e13ac3b6895a86e84145b6967", "Tornado Cash", "mixer"),
        ("0xba214c1c1928a32bffe790263e38b4af9bfcd659", "Tornado Cash", "mixer"),
        ("0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3", "Tornado Cash", "mixer"),
        ("0x910cbd523d972eb0a6f4cae4618ad62622b39dbf", "Tornado Cash", "mixer"),
        ("0xa160cdab225685da1d56aa342ad8841c3b53f291", "Tornado Cash", "mixer"),
        ("0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144", "Tornado Cash", "mixer"),
        ("0x23773e65ed146a459791799d01336db287f25334", "Tornado Cash", "mixer"),
        ("0x2717c5e28cf931733106c346be0aceeb2396cd4c", "Aave", "defi"),
        ("0x7a250d5630b4cf539739df2c5dacb4c659f2488d", "Uniswap V2: Router", "defi"),
        ("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", "Uniswap V3: Router", "defi"),
        ("0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b", "Uniswap: Universal Router", "defi"),
        ("0x1111111254eeb25477b68fb85ed929f73a960582", "1inch", "defi"),
        ("0xdef1c0ded9bec7f1a1670819833240f027b25eff", "0x: Exchange Proxy", "defi"),
    ]

    count = 0
    now = datetime.now(timezone.utc).isoformat()

    try:
        for addr, name, entity_type in known_labels:
            existing = await session.execute(
                select(Label).where(Label.address == addr.lower())
            )
            if existing.scalar_one_or_none():
                continue

            label = Label(
                address=addr.lower(),
                chain="eth",
                entity_name=name,
                entity_type=entity_type,
                source="etherscan_known",
                confidence="high",
                updated_at=now,
            )
            session.add(label)
            count += 1

        await session.commit()
    except Exception as exc:
        logger.error("Etherscan label import failed: %s", exc)
        await session.rollback()

    logger.info("Etherscan label import: added %d addresses", count)
    return count


async def import_walletexplorer_btc(session: AsyncSession) -> int:
    """
    Import known BTC address labels from WalletExplorer-style data.
    Uses a curated list of well-known BTC addresses.
    """
    known_btc_labels = [
        ("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "Satoshi Nakamoto (Genesis)", "historical"),
        ("34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo", "Binance Cold Wallet", "exchange"),
        ("bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97", "Bitfinex Cold Wallet", "exchange"),
        ("3E8ociqZa9mZUSwGdSmAEMAoAxBK3FNDcd", "Coinbase", "exchange"),
        ("1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s", "Binance Hot Wallet", "exchange"),
        ("bc1qa5wkgaew2dkv56kc6hp23lb7p4n5kg27a6g0a3", "Kraken", "exchange"),
    ]

    count = 0
    now = datetime.now(timezone.utc).isoformat()

    try:
        for addr, name, entity_type in known_btc_labels:
            existing = await session.execute(
                select(Label).where(Label.address == addr)
            )
            if existing.scalar_one_or_none():
                continue

            label = Label(
                address=addr,
                chain="btc",
                entity_name=name,
                entity_type=entity_type,
                source="walletexplorer",
                confidence="high",
                updated_at=now,
            )
            session.add(label)
            count += 1

        await session.commit()
    except Exception as exc:
        logger.error("WalletExplorer BTC import failed: %s", exc)
        await session.rollback()

    logger.info("WalletExplorer BTC import: added %d addresses", count)
    return count


def _extract_crypto_addresses(text: str) -> list[tuple[str, str]]:
    """Extract cryptocurrency addresses from OFAC remarks text."""
    import re

    addresses: list[tuple[str, str]] = []

    # ETH addresses
    for match in re.finditer(r'0x[0-9a-fA-F]{40}', text):
        addresses.append((match.group(), "eth"))

    # BTC addresses (Legacy, P2SH, Bech32)
    for match in re.finditer(r'\b(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90})\b', text):
        addresses.append((match.group(), "btc"))

    return addresses
