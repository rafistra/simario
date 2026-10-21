from celery import shared_task


@shared_task
def ping() -> str:
    """Smoke task proving the worker consumes from Redis."""
    return "pong"


@shared_task
def run_scheduled() -> list[str]:
    """Beat entry point: every registered scheduled task at the current (simulated) time."""
    from simario.core import clock, scheduler

    return scheduler.run_all(clock.now())
