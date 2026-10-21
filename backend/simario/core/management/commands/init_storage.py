from typing import Any

from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand

from simario.core.storage import s3_client


class Command(BaseCommand):
    help = "Create the S3 bucket if it does not exist (idempotent)."

    def handle(self, *args: Any, **options: Any) -> None:
        client = s3_client()
        bucket = settings.S3_BUCKET
        try:
            client.head_bucket(Bucket=bucket)
            self.stdout.write(f"Bucket {bucket} exists")
        except ClientError:
            client.create_bucket(Bucket=bucket)
            self.stdout.write(f"Bucket {bucket} created")
