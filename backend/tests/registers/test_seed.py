from simario.assessments.models import RiskQuarter
from simario.reference.models import RiskProposal
from simario.registers.models import (
    Register,
    RegisterMitigation,
    RegisterRisk,
    RegisterStageDeclaration,
)
from tests.demo import uid


def test_demo_registers_loaded(demo: None) -> None:
    assert Register.objects.count() == 6
    assert RegisterStageDeclaration.objects.count() == 12
    assert RegisterRisk.objects.count() == 28
    assert RegisterMitigation.objects.count() == 53
    assert RiskProposal.objects.count() == 2
    assert RiskQuarter.objects.count() == 41
    reg = Register.objects.get(position_id=uid("pos-ppk-a1"), fiscal_year_id=2027)
    assert reg.status == "published"
    assert isinstance(reg.data_umum["besar_anggaran"], int | float)
    assert "kegiatan" in reg.data_umum and "extra" in reg.data_umum
