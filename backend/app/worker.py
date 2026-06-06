import os
import json
import boto3
from celery import Celery
from app.core.config import get_settings

settings = get_settings()

# SQS broker URL — credentials come from EC2 IAM role automatically
celery_app = Celery(
    "sprintflow",
    broker=f"sqs://",
    broker_transport_options={
        "region": settings.aws_region,
        "predefined_queues": {
            "sprintflow-celery-queue": {
                "url": settings.sqs_queue_url,
            }
        },
    },
    task_default_queue="sprintflow-celery-queue",
    task_serializer="json",
    accept_content=["json"],
    result_backend=None,  # No result backend needed
)


def _ses_client():
    return boto3.client("ses", region_name=settings.aws_region)


EMAIL_TEMPLATES = {
    "task_assigned": {
        "subject": "You've been assigned a task in SprintFlow",
        "body": lambda d: f"""
<html><body>
<h2>You have a new task assignment</h2>
<p>Hi,</p>
<p><strong>{d.get('assigner_name', 'Someone')}</strong> assigned you a task:</p>
<h3>{d.get('task_title', 'New Task')}</h3>
<p><a href="{d.get('task_url', '#')}">View Task</a></p>
<p>— The SprintFlow Team</p>
</body></html>
""",
    },
    "comment_added": {
        "subject": "New comment on your task",
        "body": lambda d: f"""
<html><body>
<h2>New comment on a task you're following</h2>
<p><strong>{d.get('commenter_name', 'Someone')}</strong> commented on
<strong>{d.get('task_title', 'a task')}</strong>:</p>
<blockquote>{d.get('comment_preview', '')}</blockquote>
<p><a href="{d.get('task_url', '#')}">View Task</a></p>
<p>— The SprintFlow Team</p>
</body></html>
""",
    },
    "invite_email": {
        "subject": "You've been invited to join a workspace on SprintFlow",
        "body": lambda d: f"""
<html><body>
<h2>You're invited!</h2>
<p><strong>{d.get('inviter_name', 'Someone')}</strong> invited you to join
<strong>{d.get('workspace_name', 'a workspace')}</strong> on SprintFlow.</p>
<p><a href="{d.get('invite_url', '#')}">Accept Invitation</a></p>
<p>This link expires in 7 days.</p>
<p>— The SprintFlow Team</p>
</body></html>
""",
    },
}


@celery_app.task(name="send_email_notification", bind=True, max_retries=3)
def send_email_notification(self, message_body: str):
    """
    Celery task that receives an SNS→SQS message and sends the email via SES.
    The message_body is a JSON string with event_type and payload fields.
    """
    try:
        # SQS delivers SNS messages wrapped in an envelope
        outer = json.loads(message_body)
        # SNS wraps the message in a "Message" key when delivered to SQS
        if "Message" in outer:
            data = json.loads(outer["Message"])
        else:
            data = outer

        event_type = data.get("event_type")
        to_email = data.get("to_email")

        if not event_type or not to_email:
            return

        template = EMAIL_TEMPLATES.get(event_type)
        if not template:
            return

        _ses_client().send_email(
            Source=settings.ses_sender_email,
            Destination={"ToAddresses": [to_email]},
            Message={
                "Subject": {"Data": template["subject"]},
                "Body": {"Html": {"Data": template["body"](data)}},
            },
        )
    except Exception as exc:
        raise self.retry(exc=exc, countdown=60)
