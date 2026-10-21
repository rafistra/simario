from celery import shared_task


@shared_task
def ping() -> str:
    """Smoke task proving the worker consumes from Redis."""
    return "pong"
