"""
SprintFlow email worker — polls SQS directly and sends via SES.

The previous Celery-based approach failed because SNS→SQS delivers raw
notification JSON, not Celery task format. This worker polls SQS directly,
parses the SNS envelope, and calls SES without Celery task routing.

Run with: python -m app.worker
systemd ExecStart uses this directly.
"""
import json
import logging
import signal
import sys
import time
import boto3
from app.core.config import get_settings

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

settings = get_settings()

# ── Email templates ────────────────────────────────────────────────────────

EMAIL_TEMPLATES = {
    "task_assigned": {
        "subject": "You've been assigned a task in SprintFlow",
        "body": lambda d: f"""
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#1e293b">New Task Assignment</h2>
<p>Hi,</p>
<p><strong>{d.get('assigner_name', 'Someone')}</strong> assigned you a task:</p>
<div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0">
  <h3 style="margin:0;color:#0f172a">{d.get('task_title', 'New Task')}</h3>
</div>
<p><a href="{d.get('task_url', '#')}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">View Task</a></p>
<p style="color:#64748b;font-size:14px">— The SprintFlow Team</p>
</body></html>
""",
    },
    "comment_added": {
        "subject": "New comment on your task",
        "body": lambda d: f"""
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#1e293b">New Comment</h2>
<p><strong>{d.get('commenter_name', 'Someone')}</strong> commented on
<strong>{d.get('task_title', 'a task')}</strong>:</p>
<blockquote style="border-left:4px solid #cbd5e1;padding-left:16px;color:#475569">
  {d.get('comment_preview', '')}
</blockquote>
<p><a href="{d.get('task_url', '#')}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">View Task</a></p>
<p style="color:#64748b;font-size:14px">— The SprintFlow Team</p>
</body></html>
""",
    },
    "invite_email": {
        "subject": "You've been invited to join a workspace on SprintFlow",
        "body": lambda d: f"""
<html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
<h2 style="color:#1e293b">You're Invited!</h2>
<p><strong>{d.get('inviter_name', 'Someone')}</strong> invited you to join
<strong>{d.get('workspace_name', 'a workspace')}</strong> on SprintFlow.</p>
<p><a href="{d.get('invite_url', '#')}" style="background:#16a34a;color:white;padding:10px 20px;border-radius:6px;text-decoration:none">Accept Invitation</a></p>
<p style="color:#64748b;font-size:12px">This link expires in 7 days.</p>
<p style="color:#64748b;font-size:14px">— The SprintFlow Team</p>
</body></html>
""",
    },
}


# ── SES helper ─────────────────────────────────────────────────────────────

def send_email(event_type: str, data: dict) -> None:
    template = EMAIL_TEMPLATES.get(event_type)
    if not template:
        logger.warning(f"No template for event_type: {event_type}")
        return

    to_email = data.get("to_email")
    if not to_email:
        logger.warning("No to_email in payload")
        return

    ses = boto3.client("ses", region_name=settings.aws_region)
    ses.send_email(
        Source=settings.ses_sender_email,
        Destination={"ToAddresses": [to_email]},
        Message={
            "Subject": {"Data": template["subject"]},
            "Body": {"Html": {"Data": template["body"](data)}},
        },
    )
    logger.info(f"Email sent: {event_type} → {to_email}")


# ── Message processor ──────────────────────────────────────────────────────

def process_message(body: str) -> None:
    """
    Parse the SNS→SQS message envelope and send the email.

    SNS delivers to SQS in this format:
    {
      "Type": "Notification",
      "Message": "{\"event_type\": \"invite_email\", ...}",
      ...
    }
    """
    try:
        outer = json.loads(body)

        # SNS notification envelope
        if outer.get("Type") == "Notification" and "Message" in outer:
            data = json.loads(outer["Message"])
        else:
            # Direct message format
            data = outer

        event_type = data.get("event_type")
        if not event_type:
            logger.warning(f"No event_type in message: {body[:200]}")
            return

        send_email(event_type, data)

    except Exception as e:
        logger.error(f"Failed to process message: {e}\nBody: {body[:500]}")
        raise


# ── SQS poller ─────────────────────────────────────────────────────────────

def run_worker() -> None:
    logger.info("SprintFlow email worker starting...")
    logger.info(f"Queue: {settings.sqs_queue_url}")
    logger.info(f"Region: {settings.aws_region}")

    sqs = boto3.client("sqs", region_name=settings.aws_region)
    running = True

    def handle_shutdown(signum, frame):
        nonlocal running
        logger.info("Shutdown signal received, stopping worker...")
        running = False

    signal.signal(signal.SIGTERM, handle_shutdown)
    signal.signal(signal.SIGINT, handle_shutdown)

    consecutive_errors = 0

    while running:
        try:
            response = sqs.receive_message(
                QueueUrl=settings.sqs_queue_url,
                MaxNumberOfMessages=10,
                WaitTimeSeconds=20,      # Long polling
                VisibilityTimeout=300,   # 5 minutes to process
            )

            messages = response.get("Messages", [])
            if not messages:
                consecutive_errors = 0
                continue

            for message in messages:
                receipt_handle = message["ReceiptHandle"]
                body = message["Body"]

                try:
                    process_message(body)
                    # Delete on success
                    sqs.delete_message(
                        QueueUrl=settings.sqs_queue_url,
                        ReceiptHandle=receipt_handle,
                    )
                    logger.info("Message processed and deleted")
                except Exception as e:
                    logger.error(f"Message processing failed, leaving in queue for retry: {e}")
                    # Don't delete — SQS will redeliver after VisibilityTimeout

            consecutive_errors = 0

        except KeyboardInterrupt:
            break
        except Exception as e:
            consecutive_errors += 1
            logger.error(f"Worker error (#{consecutive_errors}): {e}")
            # Exponential backoff up to 60 seconds
            wait = min(60, 2 ** consecutive_errors)
            logger.info(f"Retrying in {wait}s...")
            time.sleep(wait)

    logger.info("Worker stopped.")


if __name__ == "__main__":
    run_worker()