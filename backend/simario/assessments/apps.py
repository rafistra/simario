from django.apps import AppConfig


class AssessmentsConfig(AppConfig):
    name = "simario.assessments"
    label = "assessments"

    def ready(self) -> None:
        from . import archive, reminders, tasks  # noqa: F401  (scheduled tasks, archive hook)
