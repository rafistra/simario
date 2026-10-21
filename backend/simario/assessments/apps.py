from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    name = "simario.assessments"
    label = "assessments"

    def ready(self) -> None:
        from . import tasks  # noqa: F401  (registers scheduled tasks)
