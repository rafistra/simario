from django.apps import AppConfig


class CalendarConfig(AppConfig):
    name = "simario.calendar"
    label = "calendar"

    def ready(self) -> None:
        from . import tasks  # noqa: F401  (registers scheduled tasks)
