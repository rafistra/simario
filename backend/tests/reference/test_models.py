import datetime as dt
from decimal import Decimal

import pytest
from django.db import IntegrityError, transaction

from simario.calendar.models import FiscalYear, Quarter
from simario.org.models import (
    MonitoringAssignment,
    MonitoringSupport,
    OrgUnit,
    Position,
    PositionType,
    Role,
)
from simario.reference.models import (
    RiskTemplate,
    ScoreBandVersion,
    ScoreOption,
    Stage,
)

pytestmark = pytest.mark.django_db

D = dt.date


def _quarter(year: FiscalYear, number: int) -> Quarter:
    return Quarter.objects.create(
        fiscal_year=year,
        number=number,
        starts_on=D(2027, 1, 1),
        ends_on=D(2027, 3, 31),
        lini1_opens_on=D(2027, 3, 1),
        lini1_deadline=D(2027, 3, 26),
        lini3_opens_on=D(2027, 1, 1),
        lini3_deadline=D(2027, 4, 2),
        explanation_workdays=5,
    )


def _ptype(code: str = "PPK") -> PositionType:
    role, _ = Role.objects.get_or_create(code="PMR", defaults={"name": "Pemilik Risiko"})
    return PositionType.objects.create(code=code, name=code, line=1, default_role=role)


def test_monitoring_assignment_spans_quarters() -> None:
    year = FiscalYear.objects.create(year=2027)
    q1, q4 = _quarter(year, 1), _quarter(year, 4)
    unit = OrgUnit.objects.create(code="U", name="Unit")
    ptype = _ptype()
    target, lead, s1, s2 = (
        Position.objects.create(code=f"P{i}", name=f"P{i}", org_unit=unit, position_type=ptype)
        for i in range(4)
    )
    a = MonitoringAssignment.objects.create(
        target_position=target, lead_position=lead, quarter_from=q1, quarter_to=q4
    )
    MonitoringSupport.objects.create(assignment=a, position=s1, domain="budget_performance")
    MonitoringSupport.objects.create(assignment=a, position=s2, domain="procurement")
    assert a.supports.count() == 2
    assert a.quarter_to.number == 4


def test_only_one_active_score_band_version() -> None:
    ScoreBandVersion.objects.create(number=1, effective_from=D(2026, 1, 1), status="active")
    ScoreBandVersion.objects.create(number=2, effective_from=D(2027, 1, 1), status="draft")
    ScoreBandVersion.objects.create(number=3, effective_from=D(2027, 1, 1), status="draft")
    with pytest.raises(IntegrityError), transaction.atomic():
        ScoreBandVersion.objects.create(number=4, effective_from=D(2027, 1, 1), status="active")


def test_quarter_number_unique_per_year() -> None:
    year = FiscalYear.objects.create(year=2027)
    _quarter(year, 1)
    with pytest.raises(IntegrityError), transaction.atomic():
        _quarter(year, 1)


def test_score_option_value_unique_per_version() -> None:
    v = ScoreBandVersion.objects.create(number=1, effective_from=D(2026, 1, 1), status="active")
    ScoreOption.objects.create(version=v, value=Decimal("2.0"), label="A", order=1)
    with pytest.raises(IntegrityError), transaction.atomic():
        ScoreOption.objects.create(version=v, value=Decimal("2.0"), label="B", order=2)


def test_template_code_unique() -> None:
    ptype = _ptype()
    stage = Stage.objects.create(position_type=ptype, name="Perencanaan", order=1)
    RiskTemplate.objects.create(
        code="PPK-T1-KA-01",
        position_type=ptype,
        stage=stage,
        risk_type="kinerja_anggaran",
        description="x",
        order=1,
    )
    with pytest.raises(IntegrityError), transaction.atomic():
        RiskTemplate.objects.create(
            code="PPK-T1-KA-01",
            position_type=ptype,
            stage=stage,
            risk_type="kinerja_anggaran",
            description="y",
            order=2,
        )
