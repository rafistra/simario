import uuid

from simario.registers import usage
from simario.devtools.seed import legacy_uuid as uid


def test_usage_reads_registers(demo: None) -> None:
    some = uuid.uuid4()
    assert usage.template_usage(some, 2027) == 0
    assert usage.template_ever_used(some) is False
    assert usage.published_registers(some) == []
    assert usage.template_ever_used(uid("tpl-PPK-T3-KP-02")) is True
    assert usage.template_usage(uid("tpl-PPK-T3-KP-02"), 2027) >= 1
    assert usage.stage_used(uid("stg-PPK-T3")) is True
    assert usage.running_registers_of_positions([uid("pos-pokja-03")]) == 1
    published = usage.published_registers(uid("pos-ppk-a1"))
    assert [p["fiscal_year"] for p in published] == [2027]
    assert published[0]["active_risks"] > 0
