from django.apps import AppConfig


class RegistersConfig(AppConfig):
    name = "simario.registers"
    label = "registers"

    def ready(self) -> None:
        from . import tasks  # noqa: F401  (registers scheduled tasks)
