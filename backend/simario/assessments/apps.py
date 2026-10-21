from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    name = "simario.assessments"
    label = "assessments"

    def ready(self) -> None:
        from . import archive, tasks  # noqa: F401  (registers scheduled tasks and the archive hook)
