import uuid
from sqlalchemy.orm import Session
from app.models import Notification
from app.services.aws import publish_email_event


def create_notification(
    db: Session,
    user_id: str,
    tenant_id: str,
    message: str,
    action_link: str = None,
) -> Notification:
    notif = Notification(
        id=uuid.uuid4(),
        user_id=user_id,
        tenant_id=tenant_id,
        message=message,
        action_link=action_link,
    )
    db.add(notif)
    db.flush()
    return notif


def notify_task_assigned(
    db: Session,
    assignee,
    assigner,
    task,
    task_url: str,
):
    """Write internal notification and publish SNS email event."""
    create_notification(
        db=db,
        user_id=str(assignee.id),
        tenant_id=str(task.tenant_id),
        message=f"{assigner.full_name or assigner.email} assigned you '{task.title}'",
        action_link=task_url,
    )
    publish_email_event(
        event_type="task_assigned",
        payload={
            "to_email": assignee.email,
            "assigner_name": assigner.full_name or assigner.email,
            "task_title": task.title,
            "task_url": task_url,
        },
    )


def notify_comment_added(
    db: Session,
    commenter,
    task,
    comment_body: str,
    task_url: str,
    notify_user_ids: list,
):
    """Notify task owner and prior commenters of a new comment."""
    from app.models import User

    for uid in set(notify_user_ids):
        if str(uid) == str(commenter.id):
            continue
        user = db.query(User).filter(User.id == uid).first()
        if not user:
            continue

        create_notification(
            db=db,
            user_id=str(uid),
            tenant_id=str(task.tenant_id),
            message=f"{commenter.full_name or commenter.email} commented on '{task.title}'",
            action_link=task_url,
        )
        publish_email_event(
            event_type="comment_added",
            payload={
                "to_email": user.email,
                "commenter_name": commenter.full_name or commenter.email,
                "task_title": task.title,
                "comment_preview": comment_body[:200],
                "task_url": task_url,
            },
        )


def notify_invite_accepted(
    db: Session,
    new_member,
    admin_user,
    workspace_name: str,
    tenant_id: str,
):
    create_notification(
        db=db,
        user_id=str(admin_user.id),
        tenant_id=tenant_id,
        message=f"{new_member.full_name or new_member.email} joined {workspace_name}",
    )
