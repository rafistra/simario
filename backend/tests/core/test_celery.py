from config.celery import app
from simario.core.tasks import ping


def test_ping_task_runs_eagerly() -> None:
    app.conf.task_always_eager = True
    try:
        assert ping.delay().get(timeout=5) == "pong"
    finally:
        app.conf.task_always_eager = False
