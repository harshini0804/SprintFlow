import json
import boto3
from botocore.exceptions import ClientError
from app.core.config import get_settings

settings = get_settings()


def _s3():
    return boto3.client("s3", region_name=settings.aws_region)


def _sns():
    return boto3.client("sns", region_name=settings.aws_region)


def _ses():
    return boto3.client("ses", region_name=settings.aws_region)


def _lambda():
    return boto3.client("lambda", region_name=settings.aws_region)


# ── S3 ─────────────────────────────────────────────────────────────────────

def generate_presigned_put(key: str, content_type: str, expires: int = 900) -> str:
    return _s3().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_assets_bucket,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
    )


def generate_presigned_get(key: str, expires: int = 900) -> str:
    return _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.s3_assets_bucket, "Key": key},
        ExpiresIn=expires,
    )


def delete_s3_object(key: str) -> None:
    _s3().delete_object(Bucket=settings.s3_assets_bucket, Key=key)


def get_public_url(key: str) -> str:
    """For profile pictures which are publicly readable."""
    return f"https://{settings.s3_assets_bucket}.s3.{settings.aws_region}.amazonaws.com/{key}"


# ── SNS ────────────────────────────────────────────────────────────────────

def publish_email_event(event_type: str, payload: dict) -> None:
    """Publish an email notification event to SNS. Fire-and-forget."""
    try:
        _sns().publish(
            TopicArn=settings.sns_topic_arn,
            Message=json.dumps({"event_type": event_type, **payload}),
            Subject=event_type,
            MessageAttributes={
                "event_type": {
                    "DataType": "String",
                    "StringValue": event_type,
                }
            },
        )
    except ClientError as e:
        # Non-fatal — internal notification is already written
        import logging
        logging.getLogger(__name__).error(f"SNS publish failed: {e}")


# ── Lambda ─────────────────────────────────────────────────────────────────

def invoke_task_refiner(prompt: str) -> list[str]:
    """Invoke the AI task refinement Lambda and return 5 suggestions."""
    try:
        resp = _lambda().invoke(
            FunctionName=settings.lambda_refine_function,
            InvocationType="RequestResponse",
            Payload=json.dumps({"prompt": prompt}).encode(),
        )
        result = json.loads(resp["Payload"].read())
        return result.get("suggestions", [])
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Lambda invoke failed: {e}")
        return []
