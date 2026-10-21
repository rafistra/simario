from django.db import models


class DevClock(models.Model):
    """Simulated time (spec §4.5): `sim_base` at the real instant `real_base`, then advancing
    with real time. Singleton (pk=1); read only when SIMARIO_DEV_TOOLS is on."""

    sim_base = models.DateTimeField()
    real_base = models.DateTimeField()
