import datetime as dt
from typing import Any

from simario.audit.models import AuditLog
from simario.calendar.models import Quarter
from simario.core import clock, scheduler
from simario.devtools.seed import legacy_uuid
from simario.reference.models import ScoreBand, ScoreBandVersion, ScoreOption
from tests.demo import client_for, uid

URL = "/api/v1/score-band-versions"
ACTIVE = legacy_uuid("sbv-1")


def _bands(version: Any) -> list[dict[str, Any]]:
    return [
        {
            "lowerExclusive": float(b.lower_exclusive) if b.lower_exclusive is not None else None,
            "upperInclusive": float(b.upper_inclusive),
            "predicate": b.predicate,
            "order": b.order,
            "guidance": b.guidance,
        }
        for b in ScoreBand.objects.filter(version_id=version).order_by("order")
    ]


def _options(version: Any) -> list[dict[str, Any]]:
    return [
        {"id": str(o.id), "value": float(o.value), "label": o.label}
        for o in ScoreOption.objects.filter(version_id=version).order_by("order")
    ]


def _draft(client: Any, effective: str = "2027-07-01") -> str:
    # The draft scheduled in the demo seed (sbv-2) is removed first.
    ScoreBandVersion.objects.filter(status__in=["draft", "scheduled"]).delete()
    res = client.post(URL, {"effectiveFrom": effective})
    assert res.status_code == 200, res.content
    return str(res.json()["id"])


def test_draft_copies_active_bands_and_statements(demo: None) -> None:
    nur = client_for("usr-nur")
    draft = _draft(nur)
    assert len(_bands(draft)) == 3
    assert [o["label"] for o in _options(draft)] == [o["label"] for o in _options(ACTIVE)]
    assert AuditLog.objects.filter(action="buat_draf_skala").exists()


def test_second_draft_is_refused(demo: None) -> None:
    nur = client_for("usr-nur")
    _draft(nur)
    res = nur.post(URL, {"effectiveFrom": "2027-08-01"})
    assert res.status_code == 409
    assert res.json()["code"] == "draft_exists"


def test_gap_refused_then_scheduled_and_activated_on_date(demo: None) -> None:
    nur = client_for("usr-nur")
    draft = _draft(nur)
    bands = _bands(draft)
    bands[1]["lowerExclusive"] = 2.5
    bad = nur.post(
        f"{URL}/{draft}/schedule",
        {"effectiveFrom": "2027-07-01", "bands": bands, "options": _options(draft)},
    )
    assert bad.json()["code"] == "bands_invalid"
    assert bad.json()["details"] == [{"kind": "gap", "from": 2.0, "to": 2.5}]
    ok = nur.post(
        f"{URL}/{draft}/schedule",
        {"effectiveFrom": "2027-07-01", "bands": _bands(draft), "options": _options(draft)},
    )
    assert ok.status_code == 204
    assert ScoreBandVersion.objects.get(pk=draft).status == "scheduled"
    scheduler.run_all(clock.parse_local("2027-06-30T09:00"))
    assert ScoreBandVersion.objects.get(pk=draft).status == "scheduled"
    scheduler.run_all(clock.parse_local("2027-07-01T09:00"))
    assert ScoreBandVersion.objects.get(pk=draft).status == "active"
    assert ScoreBandVersion.objects.get(pk=ACTIVE).status == "retired"


def test_quarter_fixes_version_when_first_window_opens(demo: None) -> None:
    q3 = Quarter.objects.get(pk=legacy_uuid("q-2027-3"))
    Quarter.objects.filter(pk=q3.pk).update(score_band_version=None)
    scheduler.run_all(clock.parse_local("2027-06-30T09:00"))
    assert Quarter.objects.get(pk=q3.pk).score_band_version_id is None
    first = min(q3.lini1_opens_on, q3.lini3_opens_on)
    at = dt.datetime.combine(first, dt.time(9), tzinfo=clock.WITA)
    scheduler.run_all(at)
    assert Quarter.objects.get(pk=q3.pk).score_band_version_id == ACTIVE


def test_predicate_without_statement_refused(demo: None) -> None:
    nur = client_for("usr-nur")
    draft = _draft(nur)
    options = [o for o in _options(draft) if o["value"] != 3.0]
    res = nur.post(
        f"{URL}/{draft}/schedule",
        {"effectiveFrom": "2027-07-01", "bands": _bands(draft), "options": options},
    )
    assert res.json()["code"] == "options_invalid"
    assert {"kind": "band-uncovered", "predicate": "cukup"} in res.json()["details"]


def test_discard_draft_removes_statements(demo: None) -> None:
    nur = client_for("usr-nur")
    draft = _draft(nur)
    assert nur.delete(f"{URL}/{draft}").status_code == 204
    assert not ScoreOption.objects.filter(version__id=draft).exists()
    assert AuditLog.objects.filter(action="buang_draf_skala").exists()


def test_statement_text_edited_on_active_version_only(demo: None) -> None:
    nur = client_for("usr-nur")
    option = ScoreOption.objects.filter(version_id=ACTIVE).order_by("order").first()
    assert option is not None
    res = nur.patch(f"/api/v1/score-options/{option.id}", {"label": "Kalimat baru"})
    assert res.status_code == 204
    assert ScoreOption.objects.get(pk=option.id).label == "Kalimat baru"
    assert AuditLog.objects.filter(action="ubah_kalimat_penilaian").exists()
    draft = _draft(nur)
    draft_option = ScoreOption.objects.filter(version__id=draft).first()
    assert draft_option is not None
    refused = nur.patch(f"/api/v1/score-options/{draft_option.id}", {"label": "X"})
    assert refused.json()["message"] == "Kalimat hanya dapat diubah langsung pada versi aktif."


def test_guidance_of_active_version(demo: None) -> None:
    res = client_for("usr-nur").patch("/api/v1/score-bands/cukup", {"guidance": "Panduan baru"})
    assert res.status_code == 204
    band = ScoreBand.objects.get(version_id=ACTIVE, predicate="cukup")
    assert band.guidance == "Panduan baru"


def test_only_drafts_can_be_scheduled(demo: None) -> None:
    res = client_for("usr-nur").post(
        f"{URL}/{ACTIVE}/schedule",
        {"effectiveFrom": "2027-07-01", "bands": _bands(ACTIVE), "options": _options(ACTIVE)},
    )
    assert res.json()["message"] == "Hanya draf versi yang dapat disimpan."


def test_lini1_cannot_edit_scale(demo: None) -> None:
    assert client_for("usr-andi").post(URL, {"effectiveFrom": "2027-07-01"}).status_code == 403
    assert uid("sbv-1") == str(ACTIVE)
