"""Scheduled tasks of registers (spec 4.8)."""

import datetime as dt

from django.db import transaction

from simario.assessments.models import RiskQuarter
from simario.calendar.models import FiscalYear, Quarter
from simario.calendar.serializers import QuarterSerializer
from simario.core import scheduler
from simario.domain import register as rules

from .models import Register, RegisterRisk
from .serializers import RegisterRow, RiskRow


@scheduler.register("risk_quarters")
@transaction.atomic
def ensure_risk_quarters(as_of: dt.datetime) -> None:
    """RB-REG-006: when a quarter starts, every risk assessed in it gets its RiskQuarter row
    (risks published mid-quarter get theirs at publish). Archived years are left as they are."""
    day = as_of.date().isoformat()
    open_years = set(FiscalYear.objects.exclude(status="archived").values_list("year", flat=True))
    quarters = [
        dict(q)
        for q in QuarterSerializer(
            Quarter.objects.filter(fiscal_year_id__in=open_years), many=True
        ).data
        if q["starts_on"] <= day
    ]
    if not quarters:
        return
    registers = Register.objects.filter(fiscal_year_id__in=open_years)
    db: rules.Db = {
        "registers": [dict(r) for r in RegisterRow(registers, many=True).data],
        "quarters": [dict(q) for q in QuarterSerializer(Quarter.objects.all(), many=True).data],
    }
    existing = {
        (str(rid), str(qid))
        for rid, qid in RiskQuarter.objects.values_list("register_risk_id", "quarter_id")
    }
    risks = RiskRow(
        RegisterRisk.objects.filter(register__in=registers, published_at__isnull=False), many=True
    ).data
    new = []
    for risk in risks:
        for q in quarters:
            key = (risk["id"], q["id"])
            if key in existing or not rules.assessed_in_quarter(db, dict(risk), q):
                continue
            new.append(RiskQuarter(register_risk_id=risk["id"], quarter_id=q["id"]))
            existing.add(key)
    RiskQuarter.objects.bulk_create(new)
