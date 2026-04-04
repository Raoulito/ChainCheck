import logging
from decimal import Decimal

from app.models.schemas import NormalizedTx

logger = logging.getLogger(__name__)


def apply_spam_filter(txs: list[NormalizedTx]) -> tuple[list[NormalizedTx], int]:
    """
    Flag zero-value ERC-20 transfers as suspected spam (address poisoning).
    Returns (txs_with_scores_updated, spam_count).
    """
    spam_count = 0
    result: list[NormalizedTx] = []

    for tx in txs:
        if _is_suspected_spam(tx):
            tx = tx.model_copy(update={"spam_score": "suspected_spam"})
            spam_count += 1
        result.append(tx)

    if spam_count > 0:
        logger.info("Spam filter: flagged %d transactions as suspected spam", spam_count)

    return result, spam_count


def _is_suspected_spam(tx: NormalizedTx) -> bool:
    """Check if a transaction looks like address poisoning spam."""
    # Zero-value token transfer is the primary spam indicator
    if tx.tx_type == "token" and Decimal(tx.value) == 0:
        return True

    # Extremely small token transfers to unknown addresses
    if tx.tx_type == "token" and tx.decimals > 0:
        human_value = Decimal(tx.value) / Decimal(10 ** tx.decimals)
        if human_value < Decimal("0.001") and human_value > 0:
            return True

    return False
