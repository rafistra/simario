"""S3 access (RustFS). Only standard S3 calls, so another S3 service can replace it."""

from typing import Any

import boto3
from botocore.config import Config
from django.conf import settings


def s3_client() -> Any:
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name="us-east-1",
        config=Config(
            connect_timeout=2,
            read_timeout=2,
            retries={"total_max_attempts": 1, "mode": "standard"},
        ),
    )
