import json
from pathlib import Path

import pytest
from django.core.management import call_command

from simario.devtools.seed import DEMO_PATH, legacy_uuid
from simario.org.models import Permission, PositionType, Role, RolePermission
from simario.reference.catalog import CATALOG_PATH, build_catalog
from simario.reference.models import (
    MitigationTemplate,
    RiskTemplate,
    ScoreBandVersion,
    ScoreOption,
    Stage,
)

pytestmark = pytest.mark.django_db

DEMO = json.loads(DEMO_PATH.read_text(encoding="utf-8"))


def test_seed_reference_counts() -> None:
    call_command("seed_reference")
    assert RiskTemplate.objects.values("position_type").distinct().count() == 4
    assert Stage.objects.filter(active=True).count() == 14
    assert RiskTemplate.objects.count() == 146
    assert MitigationTemplate.objects.count() == 302
    assert Permission.objects.count() == 26
    assert ScoreBandVersion.objects.get(status="active").bands.count() == 3
    assert ScoreOption.objects.count() == 5


def test_seed_reference_never_overwrites() -> None:
    call_command("seed_reference")
    tpl = RiskTemplate.objects.get(code="PPK-T4-FR-03")
    tpl.description = "diubah pengelola"
    tpl.save()
    call_command("seed_reference")
    assert RiskTemplate.objects.get(code="PPK-T4-FR-03").description == "diubah pengelola"


def test_seed_reference_matches_demo_text() -> None:
    call_command("seed_reference")
    demo_tpl = {t["code"]: t for t in DEMO["db"]["riskTemplates"]}
    for tpl in RiskTemplate.objects.all():
        assert tpl.id == legacy_uuid(demo_tpl[tpl.code]["id"])
        assert tpl.description == demo_tpl[tpl.code]["description"]
    demo_mit = {m["code"]: m for m in DEMO["db"]["mitigationTemplates"]}
    for m in MitigationTemplate.objects.all():
        assert m.description == demo_mit[m.code]["description"]


def test_committed_catalog_is_current() -> None:
    committed = json.loads(Path(CATALOG_PATH).read_text(encoding="utf-8"))
    assert committed == build_catalog(DEMO), "run: uv run python manage.py build_catalog"


def test_catalog_has_builtin_roles_only() -> None:
    call_command("seed_reference")
    assert sorted(Role.objects.values_list("code", flat=True)) == [
        "PJM",
        "PMD",
        "PMR",
        "PMT",
        "SAD",
    ]
    assert PositionType.objects.count() == 7
    assert RolePermission.objects.exists()
