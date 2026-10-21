from simario.sheets.models import PrintSnapshot


def test_demo_snapshots(demo: None) -> None:
    snaps = PrintSnapshot.objects.order_by("number")
    assert snaps.count() == 3
    first = snaps.first()
    assert first is not None
    assert first.number.startswith("SIMARIO/") and first.payload["quarter_number"] in (1, 4)
    assert set(first.payload["photos"]) == {"A", "B", "C"}
    assert any(s.is_provisional for s in snaps)
