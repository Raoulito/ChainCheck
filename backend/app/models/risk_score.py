from sqlalchemy import String, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class CachedRiskScore(Base):
    __tablename__ = "cached_risk_scores"

    address: Mapped[str] = mapped_column(String, primary_key=True)
    chain: Mapped[str] = mapped_column(String, primary_key=True)
    score: Mapped[str] = mapped_column(String, nullable=False)
    reasons_json: Mapped[str] = mapped_column(Text, nullable=False)
    computed_at: Mapped[str] = mapped_column(String, nullable=False)
    stale: Mapped[bool] = mapped_column(Boolean, default=False)
