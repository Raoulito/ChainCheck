from sqlalchemy import String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SyncLog(Base):
    __tablename__ = "sync_log"

    source: Mapped[str] = mapped_column(String, primary_key=True)
    last_synced_at: Mapped[str] = mapped_column(String, nullable=False)
    labels_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_labels: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
