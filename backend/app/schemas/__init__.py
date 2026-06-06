from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, field_validator
import re


# ── Auth ───────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str          # Required — used everywhere instead of email
    workspace_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v):
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("workspace_name")
    @classmethod
    def workspace_not_empty(cls, v):
        if not v.strip():
            raise ValueError("Workspace name cannot be empty")
        return v.strip()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    tenant_id: str


# ── User ───────────────────────────────────────────────────────────────────

class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: Optional[str]
    profile_picture_url: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None


class AvatarUploadRequest(BaseModel):
    content_type: str  # e.g. "image/jpeg"


class AvatarUrlUpdate(BaseModel):
    url: str


# ── Workspace ─────────────────────────────────────────────────────────────

class WorkspaceOut(BaseModel):
    id: UUID
    name: str
    slug: str
    subscription_status: str
    member_count: int

    model_config = {"from_attributes": True}


class WorkspaceUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None

    @field_validator("slug")
    @classmethod
    def slug_valid(cls, v):
        if v and not re.match(r"^[a-z0-9-]+$", v):
            raise ValueError("Slug must be lowercase alphanumeric with hyphens")
        return v


# ── Team ──────────────────────────────────────────────────────────────────

class TeamCreate(BaseModel):
    name: str


class TeamOut(BaseModel):
    id: UUID
    name: str
    created_at: datetime
    member_count: int = 0

    model_config = {"from_attributes": True}


class TeamMemberOut(BaseModel):
    id: UUID
    user_id: UUID
    email: str
    full_name: Optional[str]
    profile_picture_url: Optional[str]
    role: str
    joined_at: datetime

    model_config = {"from_attributes": True}


class UpdateRoleRequest(BaseModel):
    role: str


class InviteEmailRequest(BaseModel):
    email: EmailStr


class InviteLinkResponse(BaseModel):
    invite_url: str
    expires_at: datetime


# ── Project ───────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class ProjectOut(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    created_at: datetime
    task_counts: dict = {}

    model_config = {"from_attributes": True}


# ── Task ──────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    due_date: Optional[datetime] = None
    status: str = "todo"


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    assigned_to: Optional[UUID] = None
    due_date: Optional[datetime] = None


class TaskMoveRequest(BaseModel):
    status: str
    position: int


class TaskRefineRequest(BaseModel):
    prompt: str


class AssigneeOut(BaseModel):
    id: UUID
    full_name: Optional[str]
    email: str
    profile_picture_url: Optional[str]

    model_config = {"from_attributes": True}


class TaskOut(BaseModel):
    id: UUID
    title: str
    description: Optional[str]
    status: str
    position: int
    due_date: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    assignee: Optional[AssigneeOut]
    comment_count: int = 0
    attachment_count: int = 0

    model_config = {"from_attributes": True}


# ── Comment ───────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    body: str


class CommentOut(BaseModel):
    id: UUID
    body: str
    created_at: datetime
    author: AssigneeOut

    model_config = {"from_attributes": True}


# ── Attachment ────────────────────────────────────────────────────────────

class AttachmentUploadRequest(BaseModel):
    filename: str
    content_type: str
    size_bytes: Optional[int] = None


class AttachmentOut(BaseModel):
    id: UUID
    filename: str
    content_type: Optional[str]
    size_bytes: Optional[int]
    created_at: datetime
    download_url: str

    model_config = {"from_attributes": True}


class AttachmentPresignedResponse(BaseModel):
    upload_url: str
    attachment_id: UUID
    s3_key: str


# ── ActivityLog ───────────────────────────────────────────────────────────

class ActivityLogOut(BaseModel):
    id: UUID
    action: str
    metadata: Optional[dict]
    created_at: datetime
    actor: AssigneeOut

    model_config = {"from_attributes": True}


# ── Notification ──────────────────────────────────────────────────────────

class NotificationOut(BaseModel):
    id: UUID
    message: str
    is_read: bool
    action_link: Optional[str]
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Analytics ─────────────────────────────────────────────────────────────

class AnalyticsOut(BaseModel):
    total_tasks: int
    tasks_by_status: dict
    my_tasks: int
    due_this_week: int
    projects: List[dict]


# ── Billing ───────────────────────────────────────────────────────────────

class CheckoutSessionResponse(BaseModel):
    checkout_url: str


class PortalSessionResponse(BaseModel):
    portal_url: str


# ── Limits ────────────────────────────────────────────────────────────────

class LimitStatus(BaseModel):
    current: int
    limit: int
    within_limit: bool
    warning: bool  # True when >= 80% used
    at_limit: bool