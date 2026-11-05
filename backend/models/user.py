from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field

Mobile = Field(pattern=r"^[6-9]\d{9}$", description="10-digit Indian mobile number")
Password = Field(min_length=6, max_length=128)
Name = Field(min_length=2, max_length=80)
Role = Literal["admin", "user"]


class UserOut(BaseModel):
    id: str
    name: str
    mobile: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    service_ids: list[str] = []
    wallet_balance: float = 0


class SetupStatus(BaseModel):
    needs_setup: bool


class SetupIn(BaseModel):
    name: str = Name
    mobile: str = Mobile
    password: str = Password


class LoginIn(BaseModel):
    mobile: str = Field(min_length=10, max_length=10)
    password: str = Field(min_length=1)


class ProfileUpdate(BaseModel):
    name: str = Name


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Password


class UserCreate(BaseModel):
    name: str = Name
    mobile: str = Mobile
    password: str = Password
    role: Role = "user"
    service_ids: list[str] = []


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    mobile: Optional[str] = Field(default=None, pattern=r"^[6-9]\d{9}$")
    role: Optional[Role] = None
    is_active: Optional[bool] = None
    service_ids: Optional[list[str]] = None


class PasswordReset(BaseModel):
    new_password: str = Password


class Stats(BaseModel):
    total_users: int
    active_users: int
    inactive_users: int
    admins: int
    pages: int
    links: int
    recent_logins: list[UserOut]


class Ok(BaseModel):
    ok: bool = True
