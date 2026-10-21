import uuid

from simario.registers import usage


def test_usage_stub_reports_zero() -> None:
    some = uuid.uuid4()
    assert usage.template_usage(some, 2027) == 0
    assert usage.template_ever_used(some) is False
    assert usage.stage_used(some) is False
    assert usage.running_registers_of_positions([some]) == 0
    assert usage.published_registers(some) == []
