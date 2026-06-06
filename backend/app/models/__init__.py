import uuid
from datetime import datetime, timezone
from typing import ClassVar, Optional
from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey,
    Integer, String, Text, JSON, event
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.db.session import Base
import enum


def utcnow():
    return datetime.now(timezone.utc)


# ── Enums ──────────────────────────────────────────────────────────────────

class RoleEnum(str, enum.Enum):
    owner = "owner"
    admin = "admin"
    member = "member"
    viewer = "viewer"


class TaskStatusEnum(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    in_review = "in_review"
    done = "done"


class SubscriptionStatusEnum(str, enum.Enum):
    free = "free"
    active = "active"
    past_due = "past_due"
    canceled = "canceled"


# ── Tenant ─────────────────────────────────────────────────────────────────

class Tenant(Base):
    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    subscription_status = Column(
        Enum(SubscriptionStatusEnum), default=SubscriptionStatusEnum.free, nullable=False
    )
    stripe_customer_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    members = relationship("TenantMember", back_populates="tenant", cascade="all, delete-orphan")
    teams = relationship("Team", back_populates="tenant", cascade="all, delete-orphan")
    projects = relationship("Project", back_populates="tenant", cascade="all, delete-orphan")


# ── User ───────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=True)
    profile_picture_url = Column(String(500), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    # Runtime attribute injected by get_current_user dependency
    current_tenant_id: ClassVar[Optional[str]] = None

    tenant_memberships = relationship("TenantMember", back_populates="user")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


# ── TenantMember ───────────────────────────────────────────────────────────

class TenantMember(Base):
    __tablename__ = "tenant_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.member, nullable=False)
    joined_at = Column(DateTime(timezone=True), default=utcnow)

    tenant = relationship("Tenant", back_populates="members")
    user = relationship("User", back_populates="tenant_memberships")


# ── Team ───────────────────────────────────────────────────────────────────

class Team(Base):
    __tablename__ = "teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    tenant = relationship("Tenant", back_populates="teams")
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")

    invite_tokens = relationship("InviteToken", back_populates="team", cascade="all, delete-orphan")


class TeamMember(Base):
    __tablename__ = "team_members"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    role = Column(Enum(RoleEnum), default=RoleEnum.member, nullable=False)
    joined_at = Column(DateTime(timezone=True), default=utcnow)

    team = relationship("Team", back_populates="members")
    user = relationship("User")


class InviteToken(Base):
    __tablename__ = "invite_tokens"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    token = Column(String(64), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    team = relationship("Team", back_populates="invite_tokens")


# ── Project ────────────────────────────────────────────────────────────────

class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    is_deleted = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    tenant = relationship("Tenant", back_populates="projects")
    tasks = relationship("Task", back_populates="project", cascade="all, delete-orphan")


# ── Task ───────────────────────────────────────────────────────────────────

class Task(Base):
    __tablename__ = "tasks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String(500), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(Enum(TaskStatusEnum), default=TaskStatusEnum.todo, nullable=False, index=True)
    position = Column(Integer, default=0, nullable=False)
    assigned_to = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    due_date = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    project = relationship("Project", back_populates="tasks")
    assignee = relationship("User", foreign_keys=[assigned_to])
    creator = relationship("User", foreign_keys=[created_by])
    comments = relationship("TaskComment", back_populates="task", cascade="all, delete-orphan")
    attachments = relationship("TaskAttachment", back_populates="task", cascade="all, delete-orphan")
    activity_logs = relationship("ActivityLog", back_populates="task", cascade="all, delete-orphan")


class TaskComment(Base):
    __tablename__ = "task_comments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    task = relationship("Task", back_populates="comments")
    author = relationship("User")


class TaskAttachment(Base):
    __tablename__ = "task_attachments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    s3_key = Column(String(500), nullable=False)
    filename = Column(String(255), nullable=False)
    content_type = Column(String(100), nullable=True)
    size_bytes = Column(Integer, nullable=True)
    uploaded_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    task = relationship("Task", back_populates="attachments")
    uploader = relationship("User")


# ── ActivityLog ────────────────────────────────────────────────────────────

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    task_id = Column(UUID(as_uuid=True), ForeignKey("tasks.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    action = Column(String(100), nullable=False)
    log_metadata = Column("metadata", JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    task = relationship("Task", back_populates="activity_logs")
    actor = relationship("User")


# ── Notification ───────────────────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    tenant_id = Column(UUID(as_uuid=True), nullable=False)
    message = Column(String(500), nullable=False)
    is_read = Column(Boolean, default=False, nullable=False)
    action_link = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("User", back_populates="notifications")


# ── AiUsageCounter ─────────────────────────────────────────────────────────

class AiUsageCounter(Base):
    __tablename__ = "ai_usage_counters"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), nullable=False, unique=True, index=True)
    month_key = Column(String(7), nullable=False)  # e.g. "2025-06"
    count = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


# ── SQLAlchemy event listeners for ActivityLog ─────────────────────────────

def _log_task_change(mapper, connection, target):
    """Auto-log task creation via SQLAlchemy event."""
    pass  # Handled explicitly in route handlers for full context


# Register models to ensure they're imported
__all__ = [
    "Tenant", "User", "TenantMember", "Team", "TeamMember",
    "InviteToken", "Project", "Task", "TaskComment",
    "TaskAttachment", "ActivityLog", "Notification", "AiUsageCounter",
    "RoleEnum", "TaskStatusEnum", "SubscriptionStatusEnum",
]
