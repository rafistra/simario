from simario.devtools.seed import legacy_uuid
from simario.reference.models import DataUmumForm
from tests.demo import client_for, uid

URL = f"/api/v1/position-types/{uid('pt-kpa')}/data-umum-forms"


def test_data_umum_validates_and_versions(demo: None) -> None:
    nur = client_for("usr-nur")
    bad = nur.post(
        URL,
        {
            "defaultObjective": "Tujuan",
            "fields": [
                {"key": "", "label": "Target", "kind": "text", "mandatory": False},
                {
                    "key": "",
                    "label": "Sumber Dana",
                    "kind": "list",
                    "mandatory": True,
                    "options": ["Rupiah Murni"],
                },
            ],
        },
    )
    assert bad.status_code == 422
    assert bad.json()["details"] == {
        "0": "Label isian sudah dipakai.",
        "1": "Tambahkan minimal dua pilihan.",
    }
    ok = nur.post(
        URL,
        {
            "defaultObjective": "Tujuan baru.",
            "fields": [
                {
                    "key": "",
                    "label": "Sumber Dana",
                    "kind": "list",
                    "mandatory": True,
                    "options": ["Rupiah Murni", "PNBP"],
                }
            ],
        },
    )
    assert ok.json() == {"version": 2}
    active = DataUmumForm.objects.filter(position_type_id=legacy_uuid("pt-kpa"), active=True)
    assert [f.version for f in active] == [2]
    assert active[0].fields[0]["key"] == "sumber_dana"


def test_objective_optional_and_off_by_default(demo: None) -> None:
    assert not DataUmumForm.objects.filter(active=True, objective_enabled=True).exists()
    client_for("usr-nur").post(
        URL, {"defaultObjective": "", "fields": [], "objectiveEnabled": True}
    )
    kpa = DataUmumForm.objects.get(position_type_id=legacy_uuid("pt-kpa"), active=True)
    assert kpa.objective_enabled is True and kpa.default_objective == ""
