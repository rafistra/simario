from typing import Any

from django.core.management.base import BaseCommand

from simario.reference.catalog import seed_reference


class Command(BaseCommand):
    help = "Create missing reference data (all environments). Never overwrites existing rows."

    def handle(self, *args: Any, **options: Any) -> None:
        created = seed_reference()
        self.stdout.write(", ".join(f"{k} +{v}" for k, v in created.items()))
