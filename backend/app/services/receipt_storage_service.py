"""Small local receipt store used until the team chooses an object store."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

from app.config import settings


class ReceiptStorageError(RuntimeError):
    pass


class ReceiptStorageService:
    _EXTENSIONS = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
    }

    def __init__(self, root: str | None = None):
        self.root = Path(root or settings.receipt_storage_dir)

    def store(self, user_id: str, file_bytes: bytes, content_type: str) -> str:
        extension = self._EXTENSIONS.get(content_type)
        if extension is None:
            raise ReceiptStorageError("Unsupported receipt image type")

        receipt_id = f"{uuid.uuid4()}{extension}"
        user_dir = self.root / user_id
        user_dir.mkdir(parents=True, exist_ok=True)
        target = user_dir / receipt_id
        target.write_bytes(file_bytes)
        return receipt_id

    def path_for(self, user_id: str, receipt_reference: str) -> Path:
        if not re.fullmatch(
            r"[0-9a-fA-F-]{36}\.(?:jpg|png|webp)", receipt_reference
        ):
            raise ReceiptStorageError("Invalid receipt reference")
        target = (self.root / user_id / receipt_reference).resolve()
        user_root = (self.root / user_id).resolve()
        if user_root not in target.parents:
            raise ReceiptStorageError("Invalid receipt reference")
        return target
