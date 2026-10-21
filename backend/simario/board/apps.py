from django.apps import AppConfig


class BoardConfig(AppConfig):
    name = "simario.board"
    label = "board"

    def ready(self) -> None:
        from . import tasks  # noqa: F401  (registers scheduled tasks)
