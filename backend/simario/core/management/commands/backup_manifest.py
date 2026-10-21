"""Row counts per table and the bucket object count, to compare a restore with its backup."""

import json
import sys
from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandParser
from django.db import connection

from simario.core.storage import s3_client


class Command(BaseCommand):
    help = "Print or write a JSON manifest of table row counts and bucket objects."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("path", nargs="?", default="-", help="Manifest path, or - for stdout")

    def handle(self, *args: Any, **options: Any) -> None:
        tables = {}
        with connection.cursor() as cursor:
            for name in sorted(connection.introspection.table_names()):
                cursor.execute(f'SELECT count(*) FROM "{name}"')
                tables[name] = cursor.fetchone()[0]
        client = s3_client()
        objects = sum(
            len(page.get("Contents", []))
            for page in client.get_paginator("list_objects_v2").paginate(Bucket=settings.S3_BUCKET)
        )
        text = json.dumps({"tables": tables, "objects": objects}, indent=2, sort_keys=True)
        if options["path"] == "-":
            sys.stdout.write(text + "\n")
        else:
            with open(options["path"], "w", encoding="utf-8") as f:
                f.write(text + "\n")
