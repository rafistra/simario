"""Put every object of a tar archive back into the S3 bucket (restore, NFR-014). `-` reads
from stdin. Existing objects with the same key are overwritten."""

import sys
import tarfile
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser

from simario.core.storage import s3_client


class Command(BaseCommand):
    help = "Import a tar archive into the S3 bucket."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("path", help="Archive path, or - for stdin")

    def handle(self, *args: Any, **options: Any) -> None:
        client = s3_client()
        bucket = settings.S3_BUCKET
        source = sys.stdin.buffer if options["path"] == "-" else open(options["path"], "rb")
        count = 0
        with tarfile.open(fileobj=source, mode="r|") as tar:
            for member in tar:
                if not member.isfile():
                    continue
                f = tar.extractfile(member)
                if f is None:
                    continue
                client.put_object(Bucket=bucket, Key=member.name, Body=f.read())
                count += 1
        if source is not sys.stdin.buffer:
            source.close()
        self.stderr.write(f"{count} objects imported")
