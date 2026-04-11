"""
Label importers for ChainScope.

Bulk importers (run periodically via label_sync):
  - import_ofac_sdn: OFAC Specially Designated Nationals list
  - import_opensanctions: OpenSanctions sanctions dataset (crypto wallets)
  - import_walletexplorer_btc: WalletExplorer BTC addresses (API scrape + curated)
  - import_etherscan_labels: Known EVM address labels (curated)
  - import_chainabuse: ChainAbuse reported addresses (requires API key)
"""
import asyncio
import csv
import io
import json
import logging
import re
from datetime import datetime, timezone

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.label import Label

logger = logging.getLogger(__name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

async def _batch_insert_labels(
    session: AsyncSession,
    labels: list[dict],
    batch_size: int = 500,
) -> int:
    """Insert labels that don't already exist. Returns count of new inserts."""
    if not labels:
        return 0

    # Deduplicate input — first occurrence wins
    seen: set[str] = set()
    deduped: list[dict] = []
    for l in labels:
        if l["address"] not in seen:
            seen.add(l["address"])
            deduped.append(l)

    now = datetime.now(timezone.utc).isoformat()
    count = 0

    for i in range(0, len(deduped), batch_size):
        batch = deduped[i : i + batch_size]
        addresses = [l["address"] for l in batch]

        existing_result = await session.execute(
            select(Label.address).where(Label.address.in_(addresses))
        )
        existing_addrs = {row[0] for row in existing_result}

        for l in batch:
            if l["address"] in existing_addrs:
                continue
            session.add(Label(
                address=l["address"],
                chain=l["chain"],
                entity_name=l["entity_name"],
                entity_type=l["entity_type"],
                source=l["source"],
                confidence=l.get("confidence", "high"),
                updated_at=now,
            ))
            count += 1

    return count


def _extract_crypto_addresses(text: str) -> list[tuple[str, str]]:
    """Extract cryptocurrency addresses from OFAC remarks text."""
    addresses: list[tuple[str, str]] = []
    for match in re.finditer(r"0x[0-9a-fA-F]{40}", text):
        addresses.append((match.group(), "eth"))
    for match in re.finditer(
        r"\b(1[1-9A-HJ-NP-Za-km-z]{25,34}|3[1-9A-HJ-NP-Za-km-z]{25,34}|bc1[a-zA-HJ-NP-Z0-9]{25,90})\b",
        text,
    ):
        addresses.append((match.group(), "btc"))
    return addresses


_OPENSANCTIONS_CHAIN_MAP = {
    "btc": "btc", "bitcoin": "btc", "xbt": "btc",
    "eth": "eth", "ethereum": "eth", "ether": "eth",
    "bsc": "bsc", "bnb": "bsc",
    "matic": "polygon", "polygon": "polygon",
    "trx": "trx", "tron": "trx",
    "ltc": "ltc", "litecoin": "ltc",
    "xrp": "xrp", "ripple": "xrp",
    "usdt": "eth", "usdc": "eth", "dai": "eth",
    "xmr": "xmr", "monero": "xmr",
    "zec": "zec", "zcash": "zec",
    "dash": "dash", "bch": "bch", "bitcoin cash": "bch",
}


# ─── 1. OFAC SDN ─────────────────────────────────────────────────────────────

async def import_ofac_sdn(session: AsyncSession) -> int:
    """Import OFAC SDN list — cryptocurrency addresses from remarks."""
    url = "https://www.treasury.gov/ofac/downloads/sdn.csv"
    count = 0
    now = datetime.now(timezone.utc).isoformat()

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning("OFAC SDN download failed: %d", response.status_code)
                return 0

            labels_to_insert: list[dict] = []
            reader = csv.reader(io.StringIO(response.text))
            for row in reader:
                if len(row) < 12:
                    continue
                remarks = " ".join(row[11:]) if len(row) > 11 else ""
                addresses = _extract_crypto_addresses(remarks)
                entity_name = row[1].strip() if len(row) > 1 else "Unknown"

                for addr, chain in addresses:
                    norm_addr = addr if chain == "btc" else addr.lower()
                    labels_to_insert.append({
                        "address": norm_addr,
                        "chain": chain,
                        "entity_name": entity_name,
                        "entity_type": "sanctioned",
                        "source": "ofac_sdn",
                        "confidence": "high",
                    })

            count = await _batch_insert_labels(session, labels_to_insert)
            await session.commit()

    except Exception as exc:
        logger.error("OFAC SDN import failed: %s", exc)
        await session.rollback()

    logger.info("OFAC SDN import: added %d addresses", count)
    return count


# ─── 2. OpenSanctions ────────────────────────────────────────────────────────

async def import_opensanctions(session: AsyncSession) -> int:
    """
    Import sanctioned crypto wallet addresses from OpenSanctions.
    Downloads the sanctions FTM dataset, extracts CryptoWallet entities,
    and resolves holder names.
    """
    url = "https://data.opensanctions.org/datasets/latest/sanctions/entities.ftm.json"
    count = 0

    try:
        wallets: list[dict] = []
        entity_names: dict[str, str] = {}

        async with httpx.AsyncClient(timeout=180.0, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                if response.status_code != 200:
                    logger.warning("OpenSanctions download failed: %d", response.status_code)
                    return 0

                async for line in response.aiter_lines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        entity = json.loads(line)
                    except json.JSONDecodeError:
                        continue

                    schema = entity.get("schema", "")
                    props = entity.get("properties", {})
                    eid = entity.get("id", "")

                    # Collect crypto wallets
                    if schema == "CryptoWallet":
                        # OpenSanctions uses "publicKey" (not "address")
                        addrs = props.get("publicKey", []) or props.get("address", [])
                        for addr in addrs:
                            currencies = props.get("currency", ["unknown"])
                            holders = props.get("holder", [])
                            wallets.append({
                                "address": addr,
                                "currency": currencies[0] if currencies else "unknown",
                                "holder_id": holders[0] if holders else None,
                            })

                    # Collect entity names (for holder resolution)
                    names = props.get("name", [])
                    if names and eid:
                        entity_names[eid] = names[0]

        # Build label records
        labels_to_insert: list[dict] = []
        for w in wallets:
            chain = _OPENSANCTIONS_CHAIN_MAP.get(w["currency"].lower())
            if not chain:
                # Try to detect chain from address format
                addr = w["address"]
                if addr.startswith("0x") and len(addr) == 42:
                    chain = "eth"
                elif addr.startswith(("1", "3", "bc1")):
                    chain = "btc"
                else:
                    continue

            addr = w["address"]
            if chain != "btc":
                addr = addr.lower()

            holder_name = entity_names.get(w["holder_id"] or "", "Sanctioned Entity")

            labels_to_insert.append({
                "address": addr,
                "chain": chain,
                "entity_name": holder_name,
                "entity_type": "sanctioned",
                "source": "opensanctions",
                "confidence": "high",
            })

        count = await _batch_insert_labels(session, labels_to_insert)
        await session.commit()

    except Exception as exc:
        logger.error("OpenSanctions import failed: %s", exc)
        await session.rollback()

    logger.info("OpenSanctions import: added %d addresses", count)
    return count


# ─── 3. WalletExplorer BTC ───────────────────────────────────────────────────

# Wallets to scrape from WalletExplorer API
_WE_WALLETS = [
    # (api_name, display_name, entity_type)
    ("Coinbase.com", "Coinbase", "exchange"),
    ("Bitstamp.net", "Bitstamp", "exchange"),
    ("Kraken.com", "Kraken", "exchange"),
    ("Poloniex.com", "Poloniex", "exchange"),
    ("Bitfinex.com", "Bitfinex", "exchange"),
    ("Huobi.com", "Huobi", "exchange"),
    ("Binance.com", "Binance", "exchange"),
    ("OKEx.com", "OKEx", "exchange"),
    ("HitBTC.com", "HitBTC", "exchange"),
    ("Bittrex.com", "Bittrex", "exchange"),
    ("Gate.io", "Gate.io", "exchange"),
    ("Gemini.com", "Gemini", "exchange"),
    ("Luno.com", "Luno", "exchange"),
    ("Paxful.com", "Paxful", "exchange"),
    ("LocalBitcoins.com", "LocalBitcoins", "exchange"),
    ("ShapeShift.io", "ShapeShift", "exchange"),
    ("Changelly.com", "Changelly", "exchange"),
    ("BTC-e.com", "BTC-e", "exchange"),
    ("MtGox", "Mt. Gox", "exchange"),
    ("AntPool.com", "AntPool", "mining_pool"),
    ("F2Pool.com", "F2Pool", "mining_pool"),
    ("SlushPool.com", "SlushPool", "mining_pool"),
    ("ViaBTC.com", "ViaBTC", "mining_pool"),
    ("BTC.com", "BTC.com Pool", "mining_pool"),
    ("Poolin.com", "Poolin", "mining_pool"),
    ("FoundryUSAPool", "Foundry USA", "mining_pool"),
    ("SatoshiDice.com", "SatoshiDice", "gambling"),
    ("FortuneJack.com", "FortuneJack", "gambling"),
    ("CloudBet.com", "Cloudbet", "gambling"),
    ("PrimeDice.com", "PrimeDice", "gambling"),
    ("BitPay.com", "BitPay", "service"),
    ("Blockchain.info", "Blockchain.info", "service"),
    ("BestMixer.io", "BestMixer", "mixer"),
]

# Curated fallback list — used if API scraping fails
_BTC_CURATED_LABELS = [
    # Satoshi / historical
    ("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", "Satoshi Nakamoto (Genesis)", "historical"),
    ("12cbQLTFMXRnSzktFkuoG3eHoMeFtpTu3S", "Satoshi Nakamoto", "historical"),
    ("12c6DSiU4Rq3P4ZxziKxzrL5LmMBrzjrJX", "Satoshi Nakamoto (Block 1)", "historical"),
    # Binance
    ("34xp4vRoCGJym3xR7yCVPFHoCNxv4Twseo", "Binance Cold Wallet", "exchange"),
    ("3M219KR5vEneNb47ewrPfWyb5jQ2DjxRP6", "Binance", "exchange"),
    ("bc1qm34lsc65zpw79lxes69zkqmk6ee3ewf0j77s3h", "Binance", "exchange"),
    ("1NDyJtNTjmwk5xPNhjgAMu4HDHigtobu1s", "Binance Hot Wallet", "exchange"),
    ("3JZq4atUahhuA9rLhXLMhhTo133J9rF97j", "Binance", "exchange"),
    ("39884E3j6KZj82FK4vcCrkUvWYL5MQaS3v", "Binance", "exchange"),
    ("3LYJfcfHPXYJreMsASk2jkn69LWEYKzexb", "Binance", "exchange"),
    ("3Gv6q2zbxiWkcrTzdYk99KseSnDZkbQDgs", "Binance", "exchange"),
    ("1Pzaqw98PeRfyHypfqyEgg5yycJRsENrE7", "Binance", "exchange"),
    ("16ftSEQ4ctQFDtVZiUBusQUjRrGhM3JYwe", "Binance", "exchange"),
    ("3FrSzikNqBgikWgTHixywhXcx57q6H6rHC", "Binance", "exchange"),
    ("3KvgBqu16uJEA46CCi9pYG5D8WYkfcZQQP", "Binance", "exchange"),
    ("3Kvp9ieuhgCKw2XxwKbeDW9cKHcxuKsJqM", "Binance", "exchange"),
    ("3KnZmJohDM8tmmkwUax9JHXpaQPK28Ja8s", "Binance", "exchange"),
    ("32Ug2gH4aVsNpGf17Jmp4Ao4oKXTycWjyz", "Binance", "exchange"),
    ("32wBhL5j2fQkdpQPyBUwYqkqCLa9WGxoug", "Binance", "exchange"),
    ("352USv8Cih1Bq81XnzB2C9VLMQBh55Y4uV", "Binance", "exchange"),
    ("3MbzjS9tQwDVWcex8Rsj5nLLeFjJUQrUWi", "Binance", "exchange"),
    ("3K7Jv4ma644sJcZ2F9xPZsMbzrD6mn37TP", "Binance", "exchange"),
    ("3QjvmQSvufx54RDAoZdXzkj2WZG7xdvv3i", "Binance", "exchange"),
    ("37BW5FRFpwabYFZEVZxcXRqX6rykQV8YxR", "Binance", "exchange"),
    ("3CsngxVJRHMBhd29vBCNyBJsetyYgaQKhD", "Binance", "exchange"),
    ("3DujGY5vbomys9yMFFYM55ecMJCvsKFhWt", "Binance", "exchange"),
    ("3JyFh8tEjUeFPH4E9A4F9LVfUTqsCAZ7qB", "Binance", "exchange"),
    ("3GTXRviDFhp2G6kETXZuG2hZ5H3AA1yPf8", "Binance", "exchange"),
    ("3AweAnU1qYSUCJ5Hvy9DFEB7dVqUebZw5i", "Binance", "exchange"),
    ("3MZnN79KsCJ8GJ41NvUcdZf8N3vSUDxNFF", "Binance", "exchange"),
    ("391zjyfGy7LFvojtuNzgEZ6dDFxa4piHVs", "Binance", "exchange"),
    ("3HuXm9yqJaWfdR5FnTJKadJoACpqhyYXAH", "Binance", "exchange"),
    ("3HHyeS7kUZiJx1RqmGiw8Bq4NvE5znkqCx", "Binance", "exchange"),
    ("3EhC8LJDEgQ6wChJ84k8VHcawUJ1SfQCC4", "Binance", "exchange"),
    ("3896j87H819RsoupssfJS9uT9vfsHVBnwy", "Binance", "exchange"),
    ("3FLdzm2Q4Yn19nJsNiFU6HLUc6G4eBbJ5g", "Binance", "exchange"),
    ("33zXQybf5RxM6x7xwY8iTfFDkTDerCiXhh", "Binance", "exchange"),
    ("37JXGDss1A1ZC45GJnSpSW9TiNVjyFix2p", "Binance", "exchange"),
    ("32grtHykk2GGTMcfaBBE2LzbJC81Q8aUwe", "Binance", "exchange"),
    ("35rAbt5VhtgsrKqYx2WUAvdG8XzVdJp8rE", "Binance", "exchange"),
    ("3DVGMqMj35Gp7KcbsXQ6J2VJT6stFNu6Lr", "Binance", "exchange"),
    ("37tRWwodVmALbJcjw45sDaS4DczriKEezA", "Binance", "exchange"),
    ("32MHMmESiEYaBeZrCbpxMu6UF7LKDLdBPX", "Binance", "exchange"),
    ("3LYE2GiG5riP8LDVBgKyG8Hi3Dtutvt67Y", "Binance", "exchange"),
    ("3D29UMJacyUyvaUFhjcRqpLRhyGXGkAtWb", "Binance", "exchange"),
    ("33BfZP8aquATUTcg1qff3nHKHwfnGcR7HX", "Binance", "exchange"),
    ("3Ai3E9fiuR6KsoYMiCYu5xY8MjgKYG447B", "Binance", "exchange"),
    ("3E35SFZkfLMGo4qX5aVs1bBDSnAuGgBH33", "Binance", "exchange"),
    ("3H7Bsdt75sBnvUPtGwndn2jR4uKFyGJ3kV", "Binance", "exchange"),
    ("354FkxSb9J2EcRJKR7jCzH5De7AXVu459A", "Binance", "exchange"),
    # Coinbase
    ("3E8ociqZa9mZUSwGdSmAEMAoAxBK3FNDcd", "Coinbase", "exchange"),
    ("3Kzh9qAqVWQhEsfQz7zEQL1EuSx5tyNLNS", "Coinbase", "exchange"),
    ("34GUzCVLbdkMQ2UdVTaA4nxPwoovVS7y2J", "Coinbase", "exchange"),
    ("bc1q7cyrfmck2ffu2ud3rn5l5a8yv6f0chkp0zpemf", "Coinbase", "exchange"),
    ("bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh", "Coinbase", "exchange"),
    # Bitfinex
    ("bc1qgdjqv0av3q56jvd82tkdjpy7gdp9ut8tlqmgrpmv24sq90ecnvqqjwvw97", "Bitfinex Cold Wallet", "exchange"),
    ("3D2oetdNuZUqQHPJmcMDDHYoqkyNVsFk9r", "Bitfinex", "exchange"),
    ("1KYiKJEfdJtap9QX2v9BXJMpz2SfU4pgZw", "Bitfinex", "exchange"),
    # Kraken
    ("bc1qa5wkgaew2dkv56kc6hp23lb7p4n5kg27a6g0a3", "Kraken", "exchange"),
    ("3AfSccqfkCd7GDSmTnPWd2PXGY4Bh3Ckm5", "Kraken", "exchange"),
    # OKX
    ("3LU5MEd9mFoRFBqUak9cSjfD8sU4b4eMya", "OKX", "exchange"),
    ("bc1q2s3rjwvam9dt2ftt4sqxqjf3twav0gdx0k0q2etjz8kf95j0y95smz89fl", "OKX", "exchange"),
    # Huobi
    ("1HckjUpRGcrrRAtFaaCAUaGjsPx9oYmLaZ", "Huobi", "exchange"),
    ("3Mn55sfSMy9EsJaRoHEGDB9CSpN27KhTHE", "Huobi", "exchange"),
    # Bybit
    ("bc1qjysjfd9t9aspttpjqzv68k0cc9g2hjwfkn3aph", "Bybit", "exchange"),
    # Gemini
    ("36PBUPgCkXhJgH1MWPpVmGDAc7Wdh8AGXV", "Gemini", "exchange"),
    # Bitstamp
    ("3P1HBV3ECHbvPxpWfBERY7Lz2bEQHhCHwk", "Bitstamp", "exchange"),
    ("3BagsRkKHPykBhAjq6bXPsWCTMMW2ym32a", "Bitstamp", "exchange"),
    # Mt. Gox
    ("17Tf4bVQaCzwWrDWGRPC97RLCHnU4LY8Qr", "Mt. Gox", "exchange"),
    ("1EiQ5JtgEiRkhVbMbfpmxAisVG7re3EdXm", "Mt. Gox Trustee", "exchange"),
    # Silk Road / seized
    ("1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX", "FBI Silk Road Seizure", "law_enforcement"),
    # Mining pools
    ("3NA8hsjfdgVkmmVS9moHmkZsVCoLxUkvvv", "SlushPool", "mining_pool"),
    ("1KFHE7w8BhaENAswwryaoccDb6qcT6DbYY", "F2Pool", "mining_pool"),
    ("12dRugNcdxK39288NjcDV4GX7rMsKCGn6B", "AntPool", "mining_pool"),
    ("3HuobiNg2wHjdPU2mQczL9on8WF7hZmaGd", "Huobi Mining Pool", "mining_pool"),
    ("18cBEMRxXHqzWWCxZNtU91F5sbUNKhL5PX", "FoundryDigital", "mining_pool"),
    ("bc1qx9t2l3pyny2spqpqlye8svce70nppwtaxwdrp4", "Foundry USA", "mining_pool"),
    # Services
    ("38UmuUqPCrFmQo4khkomQwZ4VbY2nZMJ67", "BitPay", "service"),
    # Mixers
    ("3CGA4vZPMh2HEtFkigZPZRNb2PosnPA6CQ", "Wasabi CoinJoin", "mixer"),
    # Darknet / notable
    ("1HQ3Go3ggs8pFnXuHVHRytPCq5fGG8Hbhx", "Hydra Market", "darknet"),
]


async def import_walletexplorer_btc(session: AsyncSession) -> int:
    """
    Import BTC addresses from WalletExplorer.
    Tries API scraping first, then falls back to curated list.
    """
    count = 0
    labels_to_insert: list[dict] = []
    api_success = False

    # Phase 1: Try WalletExplorer API (deep pagination — up to 5000 per wallet)
    page_size = 100
    max_per_wallet = 5000
    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            headers={"User-Agent": "ChainScope/1.0 (forensics tool)"},
        ) as client:
            for api_name, display_name, entity_type in _WE_WALLETS:
                offset = 0
                wallet_count = 0
                try:
                    while offset < max_per_wallet:
                        resp = await client.get(
                            "https://www.walletexplorer.com/api/1/wallet-addresses",
                            params={"wallet": api_name, "from": offset, "count": page_size},
                        )
                        if resp.status_code != 200:
                            break

                        data = resp.json()
                        addrs = data.get("addresses", [])
                        if not addrs:
                            break

                        api_success = True
                        for entry in addrs:
                            addr = entry.get("address", "")
                            if addr:
                                labels_to_insert.append({
                                    "address": addr,
                                    "chain": "btc",
                                    "entity_name": display_name,
                                    "entity_type": entity_type,
                                    "source": "walletexplorer",
                                    "confidence": "high",
                                })
                                wallet_count += 1

                        if len(addrs) < page_size:
                            break
                        offset += page_size
                        await asyncio.sleep(2)  # polite rate limiting

                    if wallet_count > 0:
                        logger.debug("WalletExplorer: %s — %d addresses", display_name, wallet_count)

                except Exception as e:
                    logger.debug("WalletExplorer API failed for %s: %s", api_name, e)
                    continue

    except Exception as exc:
        logger.debug("WalletExplorer API scraping failed: %s", exc)

    # Phase 2: Always add curated list (supplements API data)
    for addr, name, entity_type in _BTC_CURATED_LABELS:
        labels_to_insert.append({
            "address": addr,
            "chain": "btc",
            "entity_name": name,
            "entity_type": entity_type,
            "source": "walletexplorer",
            "confidence": "high",
        })

    # Deduplicate by address
    seen: set[str] = set()
    deduped: list[dict] = []
    for l in labels_to_insert:
        if l["address"] not in seen:
            seen.add(l["address"])
            deduped.append(l)

    try:
        count = await _batch_insert_labels(session, deduped)
        await session.commit()
    except Exception as exc:
        logger.error("WalletExplorer import failed: %s", exc)
        await session.rollback()

    src = "API + curated" if api_success else "curated only"
    logger.info("WalletExplorer BTC import (%s): added %d addresses", src, count)
    return count


# ─── 4. Etherscan Known Labels ───────────────────────────────────────────────

_ETH_KNOWN_LABELS = [
    # ── Exchanges ──
    ("0x28c6c06298d514db089934071355e5743bf21d60", "Binance", "exchange"),
    ("0x21a31ee1afc51d94c2efccaa2092ad1028285549", "Binance", "exchange"),
    ("0xdfd5293d8e347dfe59e90efd55b2956a1343963d", "Binance", "exchange"),
    ("0x56eddb7aa87536c09ccc2793473599fd21a8b17f", "Binance", "exchange"),
    ("0x3f5ce5fbfe3e9af3971dd833d26ba9b5c936f0be", "Binance", "exchange"),
    ("0xbe0eb53f46cd790cd13851d5eff43d12404d33e8", "Binance", "exchange"),
    ("0xf977814e90da44bfa03b6295a0616a897441acec", "Binance", "exchange"),
    ("0x5a52e96bacdabb82fd05763e25335261b270efcb", "Binance", "exchange"),
    ("0x8894e0a0c962cb723c1ef8c4c1a59afc1a29baf6", "Binance", "exchange"),
    ("0xe2fc31f816a9b94326492132018c3aecc4a93ae1", "Binance", "exchange"),
    ("0x2910543af39aba0cd09dbb2d50200b3e800a63d2", "Kraken", "exchange"),
    ("0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0", "Kraken", "exchange"),
    ("0xae2d4617c862309a3d75a0ffb358c7a5009c673f", "Kraken", "exchange"),
    ("0x53d284357ec70ce289d6d64134dfac8e511c8a3d", "Kraken", "exchange"),
    ("0x2b5634c42055806a59e9107ed44d43c426e58258", "KuCoin", "exchange"),
    ("0xd6216fc19db775df9774a6e33526131da7d19a2c", "KuCoin", "exchange"),
    ("0xeb2629a2734e272bcc07bda959863f316f4bd4cf", "KuCoin", "exchange"),
    ("0x1151314c646ce4e0efd76d1af4760ae66a9fe30f", "Bitfinex", "exchange"),
    ("0x742d35cc6634c0532925a3b844bc9e7595f2bd1e", "Bitfinex", "exchange"),
    ("0x876eabf441b2ee5b5b0554fd502a8e0600950cfa", "Bitfinex", "exchange"),
    ("0xa910f92acdaf488fa6ef02174fb86208ad7722ba", "OKX", "exchange"),
    ("0x6cc5f688a315f3dc28a7781717a9a798a59fda7b", "OKX", "exchange"),
    ("0x236f9f97e0e62388479bf9e5ba4889e46b0273c3", "OKX", "exchange"),
    ("0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503", "Coinbase", "exchange"),
    ("0x71660c4005ba85c37ccec55d0c4493e66fe775d3", "Coinbase", "exchange"),
    ("0xa090e606e30bd747d4e6245a1517ebe430f0057e", "Coinbase", "exchange"),
    ("0x503828976d22510aad0201ac7ec88293211d23da", "Coinbase", "exchange"),
    ("0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740", "Coinbase", "exchange"),
    ("0x3cd751e6b0078be393132286c442345e5dc49699", "Coinbase", "exchange"),
    ("0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511", "Coinbase", "exchange"),
    ("0x881d40237659c251811cec9c364ef91dc08d300c", "Coinbase Commerce", "exchange"),
    ("0x0d0707963952f2fba59dd06f2b425ace40b492fe", "Gate.io", "exchange"),
    ("0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c", "Gate.io", "exchange"),
    ("0x0093e5f2a850268c0ca3093c7ea53731296487eb", "Gate.io", "exchange"),
    ("0xab5c66752a9e8167967685f1450532fb96d5d24f", "Huobi", "exchange"),
    ("0x6748f50f686bfbca6fe8ad62b22228b87f31ff2b", "Huobi", "exchange"),
    ("0xfdb16996831753d5331ff813c29a93c76834a0ad", "Huobi", "exchange"),
    ("0x46705dfff24256421a05d056c29e81bdc09723b8", "Huobi", "exchange"),
    ("0xe93381fb4c4f14bda253907b18fad305d799241a", "Huobi", "exchange"),
    ("0xf66852bc122fd40bfecc63cd48217e88bda12109", "Gemini", "exchange"),
    ("0x07ee55aa48bb72dcc6e9d78256648910de513eca", "Gemini", "exchange"),
    ("0x6fc82a5fe25a5cdb58bc74600a40a69c065263f8", "Gemini", "exchange"),
    ("0x61edcdf5bb737adffe5043706e7c5bb1f1a56eea", "Gemini", "exchange"),
    ("0xfbb1b73c4f0bda4f67dca266ce6ef42f520fbb98", "Bittrex", "exchange"),
    ("0xe94b04a0fed112f3664e45adb2b8915693dd5ff3", "Bittrex", "exchange"),
    ("0x66f820a414680b5bcda5eeca5dea238543f42054", "Bittrex", "exchange"),
    ("0xabc74a2fafeb965afda3e5e4e1ad6fb1b3569d15", "Bybit", "exchange"),
    ("0xf89d7b9c864f589bbf53a82105107622b35eaa40", "Bybit", "exchange"),
    ("0x2faf487a4414fe77e2327f0bf4ae2a264a776ad2", "FTX (Bankrupt)", "exchange"),
    ("0xc098b2a3aa256d2140208c3de6543aaef5cd3a94", "FTX (Bankrupt)", "exchange"),
    ("0x6f9bb7e454f5b3eb2310571b433a08e6b9b97198", "Crypto.com", "exchange"),
    ("0xcffad3200574698b78f32232aa9d63eabd290703", "Crypto.com", "exchange"),
    ("0x46340b20830761efd32832a74d7169b29feb9758", "Crypto.com", "exchange"),
    ("0xa7efae728d2936e78bda97dc267687568dd593f3", "Upbit", "exchange"),
    ("0xb38e8c17e38363af6ebdcb3dae12e0243582891d", "Upbit", "exchange"),
    # ── DeFi ──
    ("0x7a250d5630b4cf539739df2c5dacb4c659f2488d", "Uniswap V2: Router", "defi"),
    ("0x68b3465833fb72a70ecdf485e0e4c7bd8665fc45", "Uniswap V3: Router", "defi"),
    ("0xef1c6e67703c7bd7107eed8303fbe6ec2554bf6b", "Uniswap: Universal Router", "defi"),
    ("0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", "Uniswap: Universal Router V2", "defi"),
    ("0x5c69bee701ef814a2b6a3edd4b1652cb9cc5aa6f", "Uniswap V2: Factory", "defi"),
    ("0x1f98431c8ad98523631ae4a59f267346ea31f984", "Uniswap V3: Factory", "defi"),
    ("0x2717c5e28cf931733106c346be0aceeb2396cd4c", "Aave", "defi"),
    ("0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9", "Aave V2: Lending Pool", "defi"),
    ("0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", "Aave V3: Pool", "defi"),
    ("0x1111111254eeb25477b68fb85ed929f73a960582", "1inch V5: Router", "defi"),
    ("0x111111125421ca6dc452d289314280a0f8842a65", "1inch V6: Router", "defi"),
    ("0xdef1c0ded9bec7f1a1670819833240f027b25eff", "0x: Exchange Proxy", "defi"),
    ("0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", "SushiSwap: Router", "defi"),
    ("0xd533a949740bb3306d119cc777fa900ba034cd52", "Curve DAO Token", "defi"),
    ("0xbebc44782c7db0a1a60cb6fe97d0b483032f535d", "Curve: 3pool", "defi"),
    ("0x5f3b5dfeb7b28cdbd7faba78963ee202a494e2a2", "Curve: veCRV", "defi"),
    ("0x9d39a5de30e57443bff2a8307a4256c8797a3497", "Compound: cUSDC v3", "defi"),
    ("0xc3d688b66703497daa19211eedff47f25384cdc3", "Compound: cUSDCv3", "defi"),
    ("0x5a98fcbea516cf06857215779fd812ca3bef1b32", "Lido: LDO Token", "defi"),
    ("0xae7ab96520de3a18e5e111b5eaab095312d7fe84", "Lido: stETH", "defi"),
    ("0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0", "Lido: wstETH", "defi"),
    ("0x6b175474e89094c44da98b954eedeac495271d0f", "MakerDAO: DAI", "defi"),
    ("0x9f8f72aa9304c8b593d555f12ef6589cc3a579a2", "MakerDAO: MKR", "defi"),
    # ── Bridges ──
    ("0x40ec5b33f54e0e8a33a975908c5ba1c14e5bbbdf", "Polygon: PoS Bridge", "bridge"),
    ("0xa0c68c638235ee32657e8f720a23cec1bfc6c9a8", "Polygon: zkEVM Bridge", "bridge"),
    ("0x3ee18b2214aff97000d974cf647e7c347e8fa585", "Wormhole: Portal", "bridge"),
    ("0x8eb8a3b98659cce290402893d0123abb75e3ab28", "Avalanche Bridge", "bridge"),
    ("0x99c9fc46f92e8a1c0dec1b1747d010903e884be1", "Optimism: Gateway", "bridge"),
    ("0x49048044d57e1c92a77f79988d21fa8faf74e97e", "Base: Portal", "bridge"),
    ("0x3307c46a1e9633025d2e89658c9099a4e3833303", "Arbitrum: Gateway", "bridge"),
    # ── Mixers ──
    ("0xd9dab021e74ecf475788ed7b61356bb3589ee2ad", "Tornado Cash", "mixer"),
    ("0x722122df12d4e14e13ac3b6895a86e84145b6967", "Tornado Cash", "mixer"),
    ("0xba214c1c1928a32bffe790263e38b4af9bfcd659", "Tornado Cash", "mixer"),
    ("0xd4b88df4d29f5cedd6857912842cff3b20c8cfa3", "Tornado Cash", "mixer"),
    ("0x910cbd523d972eb0a6f4cae4618ad62622b39dbf", "Tornado Cash", "mixer"),
    ("0xa160cdab225685da1d56aa342ad8841c3b53f291", "Tornado Cash", "mixer"),
    ("0xfd8610d20aa15b7b2e3be39b396a1bc3516c7144", "Tornado Cash", "mixer"),
    ("0x23773e65ed146a459791799d01336db287f25334", "Tornado Cash", "mixer"),
    ("0x12d66f87a04a9e220743712ce6d9bb1b5616b8fc", "Tornado Cash", "mixer"),
    ("0x47ce0c6ed5b0ce3d3a51fdb1c52dc66a7c3c2936", "Tornado Cash", "mixer"),
    ("0x94a1b5cdb22c43faab4abeb5c74999e7520b9023", "Railgun", "mixer"),
    # ── Stablecoins ──
    ("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "Circle: USDC", "stablecoin"),
    ("0xdac17f958d2ee523a2206206994597c13d831ec7", "Tether: USDT", "stablecoin"),
    ("0x4fabb145d64652a948d72533023f6e7a623c7c53", "Binance: BUSD", "stablecoin"),
    # ── Notable / hacks ──
    ("0xba12222222228d8ba445958a75a0704d566bf2c8", "Balancer: Vault", "defi"),
    ("0x0000000000007f150bd6f54c40a34d7c3d5e9f56", "MEV Bot: jaredfromsubway", "mev"),
    ("0x00000000219ab540356cbb839cbe05303d7705fa", "ETH2 Deposit Contract", "service"),
    ("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "WETH", "defi"),
    # ── Scams / hacks ──
    ("0x098b716b8aaf21512996dc57eb0615e2383e2f96", "Ronin Bridge Exploiter (Lazarus)", "sanctioned"),
    ("0x35fb6f6db4fb05e6a4ce86f2c93270f0461b11f3", "Harmony Bridge Exploiter", "sanctioned"),
]

async def import_etherscan_labels(session: AsyncSession) -> int:
    """Import known EVM address labels (curated list)."""
    count = 0

    try:
        labels_to_insert = [
            {
                "address": addr.lower(),
                "chain": "eth",
                "entity_name": name,
                "entity_type": entity_type,
                "source": "etherscan_known",
                "confidence": "high",
            }
            for addr, name, entity_type in _ETH_KNOWN_LABELS
        ]
        count = await _batch_insert_labels(session, labels_to_insert)
        await session.commit()
    except Exception as exc:
        logger.error("Etherscan label import failed: %s", exc)
        await session.rollback()

    logger.info("Etherscan label import: added %d addresses", count)
    return count


# ─── 5. ChainAbuse ───────────────────────────────────────────────────────────

async def import_chainabuse(session: AsyncSession, api_key: str) -> int:
    """
    Import reported scam/fraud addresses from ChainAbuse API.
    Fetches recent reports and labels reported addresses.
    Requires a ChainAbuse API key.
    """
    if not api_key:
        logger.info("ChainAbuse import skipped: no API key configured")
        return 0

    base_url = "https://www.chainabuse.com/api/v0/reports"
    count = 0
    labels_to_insert: list[dict] = []

    try:
        async with httpx.AsyncClient(
            timeout=30.0,
            headers={"X-API-KEY": api_key, "Accept": "application/json"},
        ) as client:
            # Fetch recent reports (paginated)
            page = 0
            max_pages = 10

            while page < max_pages:
                resp = await client.get(base_url, params={"page": page, "limit": 100})
                if resp.status_code == 401:
                    logger.warning("ChainAbuse API: invalid API key")
                    break
                if resp.status_code != 200:
                    break

                data = resp.json()
                reports = data if isinstance(data, list) else data.get("reports", [])
                if not reports:
                    break

                for report in reports:
                    addr = report.get("address", "")
                    if not addr:
                        continue

                    # Determine chain
                    chain_raw = report.get("chain", "").lower()
                    if chain_raw in ("bitcoin", "btc"):
                        chain = "btc"
                    elif chain_raw in ("ethereum", "eth"):
                        chain = "eth"
                        addr = addr.lower()
                    elif chain_raw in ("bsc", "bnb"):
                        chain = "bsc"
                        addr = addr.lower()
                    else:
                        # Detect from format
                        if addr.startswith("0x") and len(addr) == 42:
                            chain = "eth"
                            addr = addr.lower()
                        elif addr.startswith(("1", "3", "bc1")):
                            chain = "btc"
                        else:
                            continue

                    category = report.get("category", "scam").lower()
                    entity_type = "scam"
                    if "ransomware" in category:
                        entity_type = "ransomware"
                    elif "darknet" in category or "dark" in category:
                        entity_type = "darknet"

                    labels_to_insert.append({
                        "address": addr,
                        "chain": chain,
                        "entity_name": f"Reported: {category}",
                        "entity_type": entity_type,
                        "source": "chainabuse",
                        "confidence": "medium",
                    })

                page += 1
                await asyncio.sleep(1)

        # Deduplicate
        seen: set[str] = set()
        deduped: list[dict] = []
        for l in labels_to_insert:
            if l["address"] not in seen:
                seen.add(l["address"])
                deduped.append(l)

        count = await _batch_insert_labels(session, deduped)
        await session.commit()

    except Exception as exc:
        logger.error("ChainAbuse import failed: %s", exc)
        await session.rollback()

    logger.info("ChainAbuse import: added %d addresses", count)
    return count
