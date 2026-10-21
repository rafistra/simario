from typing import Any

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError, CommandParser

from simario.core import clock
from simario.devtools.seed import load_demo


class Command(BaseCommand):
    help = "Replace all data with the prototype demo seed (local development only)."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument("--as-of", help="YYYY-MM-DDTHH:mm (WITA): drop later activity")

    def handle(self, *args: Any, **options: Any) -> None:
        if not settings.SIMARIO_DEV_TOOLS:
            raise CommandError("seed_demo needs SIMARIO_DEV_TOOLS=true")
        as_of = clock.parse_local(options["as_of"]) if options["as_of"] else None
        counts = load_demo(as_of)
        self.stdout.write(", ".join(f"{k} {v}" for k, v in counts.items()))
