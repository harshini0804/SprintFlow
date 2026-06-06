from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models import Project, TaskAttachment, AiUsageCounter, SubscriptionStatusEnum
from app.schemas import LimitStatus
from app.core.config import get_settings

settings = get_settings()


def _is_pro(tenant) -> bool:
    return tenant.subscription_status == SubscriptionStatusEnum.active


def check_project_limit(db: Session, tenant) -> LimitStatus:
    if _is_pro(tenant):
        return LimitStatus(current=0, limit=999999, within_limit=True, warning=False, at_limit=False)
    count = db.query(Project).filter(
        Project.tenant_id == tenant.id,
        Project.is_deleted == False
    ).count()
    limit = settings.free_max_projects
    return LimitStatus(
        current=count,
        limit=limit,
        within_limit=count < limit,
        warning=count >= int(limit * 0.8),
        at_limit=count >= limit,
    )


def check_member_limit(db: Session, tenant, current_count: int) -> LimitStatus:
    if _is_pro(tenant):
        return LimitStatus(current=current_count, limit=999999, within_limit=True, warning=False, at_limit=False)
    limit = settings.free_max_members
    return LimitStatus(
        current=current_count,
        limit=limit,
        within_limit=current_count < limit,
        warning=current_count >= int(limit * 0.8),
        at_limit=current_count >= limit,
    )


def check_attachment_limit(db: Session, tenant, task_id) -> LimitStatus:
    if _is_pro(tenant):
        return LimitStatus(current=0, limit=999999, within_limit=True, warning=False, at_limit=False)
    count = db.query(TaskAttachment).filter(TaskAttachment.task_id == task_id).count()
    limit = settings.free_max_attachments_per_task
    return LimitStatus(
        current=count,
        limit=limit,
        within_limit=count < limit,
        warning=count >= int(limit * 0.8),
        at_limit=count >= limit,
    )


def check_and_increment_ai_usage(db: Session, tenant) -> LimitStatus:
    if _is_pro(tenant):
        return LimitStatus(current=0, limit=999999, within_limit=True, warning=False, at_limit=False)
    month_key = datetime.now(timezone.utc).strftime("%Y-%m")
    counter = db.query(AiUsageCounter).filter(
        AiUsageCounter.tenant_id == tenant.id,
        AiUsageCounter.month_key == month_key,
    ).first()
    if not counter:
        import uuid
        counter = AiUsageCounter(
            id=uuid.uuid4(),
            tenant_id=tenant.id,
            month_key=month_key,
            count=0,
        )
        db.add(counter)
    limit = settings.free_max_ai_uses_per_month
    status = LimitStatus(
        current=counter.count,
        limit=limit,
        within_limit=counter.count < limit,
        warning=counter.count >= int(limit * 0.8),
        at_limit=counter.count >= limit,
    )
    if status.within_limit:
        counter.count += 1
        db.flush()
    return status
