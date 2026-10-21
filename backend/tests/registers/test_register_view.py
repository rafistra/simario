import uuid

from simario.registers.models import RegisterRisk
from tests.demo import client_for, uid

URL = "/api/v1/registers"


def _view(persona: str, position: str = "pos-ppk-a1", year: int = 2027):  # type: ignore[no-untyped-def]
    return client_for(persona).get(f"{URL}/{uid(position)}/{year}")


def test_holder_sees_register_access_and_no_gaps(demo: None) -> None:
    res = _view("usr-andi")
    assert res.status_code == 200
    body = res.json()
    assert body["register"]["status"] == "published"
    assert body["access"]["canPublish"] is True and body["access"]["isHolder"] is True
    assert body["gaps"] == []
    assert body["stagesDone"] == {"complete": 5, "total": 5}
    assert body["previousRegister"] is True
    assert body["register"]["dataUmum"]["besarAnggaran"] > 0
    first = body["stages"][0]
    assert first["index"] == 1 and len(first["subsections"]) == 3


def test_reader_sees_published_items_only(demo: None) -> None:
    published = RegisterRisk.objects.filter(
        register__position_id=uid("pos-ppk-a1"), register__fiscal_year_id=2027
    ).first()
    assert published is not None
    draft = RegisterRisk.objects.create(
        register=published.register,
        stage=published.stage,
        risk_type=published.risk_type,
        description_snapshot="Tambahan draf",
        is_custom=True,
        status="draft",
        lineage_id="lin-x",
    )
    holder = _view("usr-andi").json()
    assert str(draft.id) in {r["id"] for r in holder["risks"]}
    assert str(draft.id) in {r["id"] for r in holder["pending"]["risks"]}
    reader = _view("usr-siti").json()
    assert reader["access"]["isHolder"] is False
    assert str(draft.id) not in {r["id"] for r in reader["risks"]}
    assert reader["pending"] == {"risks": [], "mitigations": []}
    assert reader["gaps"] == [] and reader["flagged"] == []


def test_out_of_scope_reader_is_refused(demo: None) -> None:
    res = _view("usr-bambang")
    assert res.status_code == 403
    assert res.json()["message"] == "Anda tidak memiliki akses ke jabatan ini."


def test_unknown_position(demo: None) -> None:
    res = client_for("usr-admin").get(f"{URL}/{uuid.uuid4()}/2027")
    assert res.status_code in (403, 404)


def test_never_published_register_is_hidden_from_readers(demo: None) -> None:
    holder = _view("usr-dimas", "pos-pokja-03")
    assert holder.json()["register"]["status"] == "draft"
    reader = _view("usr-admin", "pos-pokja-03").json()
    assert reader["register"] is None and reader["unpublishedForReader"] is True
