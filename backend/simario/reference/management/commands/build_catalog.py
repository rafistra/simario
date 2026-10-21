import json
from typing import Any

from django.core.management.base import BaseCommand

from simario.devtools.seed import load_raw
from simario.reference.catalog import CATALOG_PATH, build_catalog


class Command(BaseCommand):
    help = "Regenerate simario/reference/catalog.json from the prototype export (demo.json)."

    def handle(self, *args: Any, **options: Any) -> None:
        catalog = build_catalog(load_raw())
        CATALOG_PATH.write_text(
            json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        self.stdout.write(f"Wrote {CATALOG_PATH}")
