from django.apps import AppConfig


class OrgConfig(AppConfig):
    name = "simario.org"
    label = "org"

    def ready(self) -> None:
        from . import tasks  # noqa: F401  (registers scheduled tasks)
