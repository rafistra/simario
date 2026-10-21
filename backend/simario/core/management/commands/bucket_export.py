"""Write every object of the S3 bucket into a tar archive (backup, NFR-014). `-` writes to
stdout, so `docker compose exec -T api python manage.py bucket_export - > bucket.tar` works."""

import io
import sys
import tarfile
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser

from simario.core.storage import s3_client


class Command(BaseCommand):
    help = "Export the S3 bucket to a tar archive."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("path", help="Archive path, or - for stdout")

    def handle(self, *args: Any, **options: Any) -> None:
        client = s3_client()
        bucket = settings.S3_BUCKET
        target = sys.stdout.buffer if options["path"] == "-" else open(options["path"], "wb")
        count = 0
        with tarfile.open(fileobj=target, mode="w|") as tar:
            for page in client.get_paginator("list_objects_v2").paginate(Bucket=bucket):
                for obj in page.get("Contents", []):
                    data = client.get_object(Bucket=bucket, Key=obj["Key"])["Body"].read()
                    info = tarfile.TarInfo(obj["Key"])
                    info.size = len(data)
                    tar.addfile(info, io.BytesIO(data))
                    count += 1
        if target is not sys.stdout.buffer:
            target.close()
        self.stderr.write(f"{count} objects exported")
