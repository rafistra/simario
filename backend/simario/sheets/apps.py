from django.apps import AppConfig


class SheetsConfig(AppConfig):
    name = "simario.sheets"
    label = "sheets"

    def ready(self) -> None:
        from . import services  # noqa: F401  (registers sheet_freeze and the archive hook)
