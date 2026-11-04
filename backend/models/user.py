from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

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
    admin_scope: Literal["full", "files"] = "full"  # "files" = User files & receipts only
    is_owner: bool = False


AdminScope = Literal["full", "files"]
# New admins: at least 8 characters with a letter and a number.
class AdminRegisterIn(BaseModel):
    name: str = Name
    mobile: str = Mobile
    password: str = Field(min_length=8, max_length=128)

    @field_validator("password")
    @classmethod
    def strong(cls, v: str) -> str:
        if not (any(c.isalpha() for c in v) and any(c.isdigit() for c in v)):
            raise ValueError("Password must have at least 8 characters with a letter and a number")
        return v


class AdminRequest(BaseModel):
    id: str
    name: str
    mobile: str
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime
    resolved_at: Optional[datetime] = None
    scope: Optional[AdminScope] = None


class ApproveAdminIn(BaseModel):
    scope: AdminScope


class ScopeIn(BaseModel):
    scope: AdminScope


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
