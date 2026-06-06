import boto3
import os
from functools import lru_cache
from pydantic_settings import BaseSettings


def _get_ssm(name: str, default: str = "") -> str:
    """Fetch a single SSM parameter. Falls back to env var for local dev."""
    env_val = os.environ.get(name.replace("/sprintflow/", "").upper().replace("/", "_"))
    if env_val:
        return env_val
    try:
        client = boto3.client("ssm", region_name=os.environ.get("AWS_REGION", "ap-south-1"))
        resp = client.get_parameter(Name=name, WithDecryption=True)
        return resp["Parameter"]["Value"]
    except Exception:
        return default


class Settings(BaseSettings):
    # App
    app_name: str = "SprintFlow"
    debug: bool = False
    api_prefix: str = "/api"

    # Database — loaded from SSM or env
    database_url: str = ""
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expiry_days: int = 7

    # AWS
    aws_region: str = "ap-south-1"
    s3_assets_bucket: str = ""
    sns_topic_arn: str = ""
    sqs_queue_url: str = ""
    ses_sender_email: str = ""
    cloudfront_domain: str = ""

    # Stripe
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""

    # Lambda
    lambda_refine_function: str = "sprintflow-task-refiner"

    # Feature limits (free tier)
    free_max_projects: int = 10
    free_max_members: int = 5
    free_max_attachments_per_task: int = 5
    free_max_ai_uses_per_month: int = 20

    class Config:
        env_file = ".env"


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    # Override with SSM values when running on EC2 (no .env file present)
    if not s.database_url:
        db_host = _get_ssm("/sprintflow/db_host")
        db_pass = _get_ssm("/sprintflow/db_password")
        db_name = _get_ssm("/sprintflow/db_name", "sprintflow")
        db_user = _get_ssm("/sprintflow/db_user", "postgres")
        if db_host:
            s.database_url = f"postgresql+psycopg://{db_user}:{db_pass}@{db_host}:5432/{db_name}"
    if not s.jwt_secret:
        s.jwt_secret = _get_ssm("/sprintflow/jwt_secret")
    if not s.s3_assets_bucket:
        s.s3_assets_bucket = _get_ssm("/sprintflow/s3_assets_bucket")
    if not s.sns_topic_arn:
        s.sns_topic_arn = _get_ssm("/sprintflow/sns_topic_arn")
    if not s.sqs_queue_url:
        s.sqs_queue_url = _get_ssm("/sprintflow/sqs_queue_url")
    if not s.ses_sender_email:
        s.ses_sender_email = _get_ssm("/sprintflow/ses_sender_email")
    if not s.stripe_secret_key:
        s.stripe_secret_key = _get_ssm("/sprintflow/stripe_secret_key")
    if not s.stripe_webhook_secret:
        s.stripe_webhook_secret = _get_ssm("/sprintflow/stripe_webhook_secret")
    if not s.cloudfront_domain:
        s.cloudfront_domain = _get_ssm("/sprintflow/cloudfront_domain")
    return s
