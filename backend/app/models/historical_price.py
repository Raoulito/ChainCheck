from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class HistoricalPrice(Base):
    __tablename__ = "historical_prices"

    token: Mapped[str] = mapped_column(String, primary_key=True)
    date: Mapped[str] = mapped_column(String, primary_key=True)
    price_usd: Mapped[str] = mapped_column(String, nullable=False)
