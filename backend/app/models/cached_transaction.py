from sqlalchemy import String, Integer, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CachedTransaction(Base):
    __tablename__ = "cached_transactions"

    tx_hash: Mapped[str] = mapped_column(String, primary_key=True)
    chain: Mapped[str] = mapped_column(String, primary_key=True)
    block: Mapped[int] = mapped_column(Integer, nullable=False)
    data: Mapped[str] = mapped_column(Text, nullable=False)
    finalized: Mapped[bool] = mapped_column(Boolean, default=False)
    cached_at: Mapped[str] = mapped_column(String, nullable=False)
