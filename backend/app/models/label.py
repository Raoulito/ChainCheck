from sqlalchemy import String, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Label(Base):
    __tablename__ = "labels"

    address: Mapped[str] = mapped_column(String, primary_key=True)
    chain: Mapped[str] = mapped_column(String, nullable=False)
    entity_name: Mapped[str] = mapped_column(String, nullable=False)
    entity_type: Mapped[str] = mapped_column(String, nullable=False)
    source: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[str] = mapped_column(String, default="high")
    updated_at: Mapped[str] = mapped_column(String, nullable=False)

    __table_args__ = (
        Index("idx_labels_chain_type", "chain", "entity_type"),
        Index("idx_labels_entity", "entity_name"),
    )
