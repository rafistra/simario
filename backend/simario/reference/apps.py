from django.apps import AppConfig


class ReferenceConfig(AppConfig):
    name = "simario.reference"
    label = "reference"

    def ready(self) -> None:
        from . import tasks  # noqa: F401  (registers scheduled tasks)
