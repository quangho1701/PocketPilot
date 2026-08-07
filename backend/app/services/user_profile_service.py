from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user_profile import UserProfile
from app.schemas.user_profile import UserProfileCreate, UserProfileUpdate


class SetupManagedProfileError(ValueError):
    """Raised when a generic profile update would desynchronize setup memory."""


SETUP_MANAGED_PROFILE_FIELDS = frozenset(
    {
        "monthly_income",
        "income_frequency",
        "savings_priority",
        "spending_categories",
        "currency",
        "financial_situation_notes",
    }
)


class UserProfileService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_profile(self, user_id: str) -> Optional[UserProfile]:
        result = await self.db.execute(
            select(UserProfile).where(UserProfile.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def get_or_create_profile(self, user_id: str) -> UserProfile:
        profile = await self.get_profile(user_id)
        if profile:
            return profile
        profile = UserProfile(user_id=user_id)
        self.db.add(profile)
        await self.db.flush()
        return profile

    async def create_profile(self, user_id: str, data: UserProfileCreate) -> UserProfile:
        profile = UserProfile(user_id=user_id, **data.model_dump(exclude_none=True))
        self.db.add(profile)
        await self.db.flush()
        return profile

    async def update_profile(self, user_id: str, data: UserProfileUpdate) -> UserProfile:
        profile = await self.get_or_create_profile(user_id)
        update_data = data.model_dump(exclude_none=True)
        managed_fields = SETUP_MANAGED_PROFILE_FIELDS.intersection(update_data)
        if profile.financial_setup_completed_at is not None and managed_fields:
            fields = ", ".join(sorted(managed_fields))
            raise SetupManagedProfileError(
                "Completed financial setup fields must be updated through "
                f"PUT /api/v1/setup: {fields}"
            )
        for field, value in update_data.items():
            setattr(profile, field, value)
        await self.db.flush()
        return profile
