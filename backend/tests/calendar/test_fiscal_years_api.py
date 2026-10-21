import datetime as dt

import pytest

from simario.assessments import usage
from simario.audit.models import AuditLog
from simario.calendar import services
from simario.calendar.models import FiscalYear, Quarter, QuarterAssessor
from simario.core import clock, scheduler
from tests.demo import client_for, uid


def test_create_year_with_default_quarters_and_inv9(demo: None) -> None:
    admin = client_for("usr-admin")
    res = admin.post("/api/v1/fiscal-years", {"year": 2028}, format="json")
    assert res.status_code == 204
    quarters = list(Quarter.objects.filter(fiscal_year_id=2028).order_by("number"))
    assert [q.lini1_deadline for q in quarters] == [
        dt.date(2028, 3, 31),
        dt.date(2028, 6, 30),
        dt.date(2028, 9, 29),
        dt.date(2028, 12, 29),
    ]
    assert AuditLog.objects.filter(action="buat_tahun_anggaran", entity_id="2028").exists()
    dup = admin.post("/api/v1/fiscal-years", {"year": 2028}, format="json")
    assert dup.status_code == 422 and dup.json()["message"] == "TA 2028 sudah ada."

    tw2 = quarters[1]
    bad = admin.patch(f"/api/v1/quarters/{tw2.id}", {"lini3Deadline": "2028-06-01"}, format="json")
    assert bad.status_code == 422
    assert bad.json()["code"] == "inv9"
    assert bad.json()["message"] == "TW II: tenggat Lini 3 harus sesudah tenggat Lini 1."
    assert bad.json()["details"][0] == {
        "quarterId": str(tw2.id),
        "field": "lini3Deadline",
        "message": "TW II: tenggat Lini 3 harus sesudah tenggat Lini 1.",
    }
    ok = admin.patch(f"/api/v1/quarters/{tw2.id}", {"lini3Deadline": "2028-07-10"}, format="json")
    assert ok.status_code == 204
    assert Quarter.objects.get(pk=tw2.id).lini3_deadline == dt.date(2028, 7, 10)

    fy = admin.patch("/api/v1/fiscal-years/2028", {"toleranceDays": -1}, format="json")
    assert fy.json()["message"] == "Jumlah hari tidak boleh negatif."
    assert (
        admin.patch("/api/v1/fiscal-years/2028", {"toleranceDays": 5}, format="json").status_code
        == 204
    )
    assert FiscalYear.objects.get(pk=2028).tolerance_days == 5


def test_passed_deadline_needs_confirmation(demo: None) -> None:
    admin = client_for("usr-admin")
    tw1 = uid("q-2027-1")
    res = admin.patch(f"/api/v1/quarters/{tw1}", {"lini1Deadline": "2027-03-29"}, format="json")
    assert res.status_code == 409 and res.json()["code"] == "confirm"
    assert res.json()["message"] == (
        "Tenggat ini sudah lewat. Keterlambatan yang sudah tercatat tidak dihitung ulang."
    )
    confirmed = admin.patch(
        f"/api/v1/quarters/{tw1}",
        {"lini1Deadline": "2027-03-29", "confirmPastDeadline": True},
        format="json",
    )
    assert confirmed.status_code == 204


def test_archived_year_is_read_only(demo: None) -> None:
    res = client_for("usr-admin").patch(
        f"/api/v1/quarters/{uid('q-2026-1')}", {"explanationWorkdays": 6}, format="json"
    )
    assert res.status_code == 409
    assert res.json()["message"] == "Tahun anggaran ini sudah diarsipkan."


def test_exclude_assessor_only_before_finalising(
    demo: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    admin = client_for("usr-admin")
    url = f"/api/v1/quarters/{uid('q-2027-2')}/assessors/{uid('pos-pai')}/exclude"
    QuarterAssessor.objects.get_or_create(quarter_id=uid("q-2027-2"), position_id=uid("pos-pai"))
    assert admin.post(url, {"reason": " "}, format="json").json()["message"] == (
        "Alasan pengecualian wajib diisi."
    )
    monkeypatch.setattr(usage, "assessor_has_finalised", lambda q, p: True)
    refused = admin.post(url, {"reason": "Cuti bersama"}, format="json")
    assert refused.status_code == 422
    assert refused.json()["message"] == (
        "Direktorat ini sudah menuntaskan penilaian pada triwulan ini dan tidak dapat dikecualikan."
    )
    monkeypatch.setattr(usage, "assessor_has_finalised", lambda q, p: False)
    assert admin.post(url, {"reason": "Cuti bersama"}, format="json").status_code == 204
    row = QuarterAssessor.objects.get(quarter_id=uid("q-2027-2"), position_id=uid("pos-pai"))
    assert row.excluded and row.exclusion_reason == "Cuti bersama"
    assert AuditLog.objects.filter(action="kecualikan_penilai").exists()


def test_calendar_task_opens_lini3_assessor_set(demo: None) -> None:
    client_for("usr-admin").post("/api/v1/fiscal-years", {"year": 2028}, format="json")
    tw1 = Quarter.objects.get(fiscal_year_id=2028, number=1)
    assert not QuarterAssessor.objects.filter(quarter=tw1).exists()
    scheduler.run_all(clock.parse_local("2028-01-01T08:00"))
    assessors = set(
        QuarterAssessor.objects.filter(quarter=tw1).values_list("position_id", flat=True)
    )
    assert {str(p) for p in assessors} >= {uid("pos-kepatuhan"), uid("pos-pai")}
    assert FiscalYear.objects.get(pk=2027).status == "closing"


def test_archive_runs_registered_hooks(demo: None, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[int, dt.datetime]] = []
    monkeypatch.setattr(services, "_ARCHIVE_HOOKS", [])
    services.on_archive(lambda fy, at: calls.append((fy.year, at)))
    admin = client_for("usr-admin")
    blocked = admin.post("/api/v1/fiscal-years/2027/archive")
    assert blocked.status_code == 409 and blocked.json()["code"] == "blocked"
    assert blocked.json()["message"] == (
        "TW IV belum lengkap: 5 penjelasan wajib belum dikirim dan masih dalam tenggat; "
        "TW IV berakhir 31 Des 2027."
    )
    status = admin.get("/api/v1/fiscal-years/2027/archive-status").json()
    assert status["baseHardLimit"] == "2028-02-13"
    assert status["projected"] == "2028-02-13"

    clock.set_now(clock.parse_local("2028-01-10T09:00"))
    res = admin.post("/api/v1/fiscal-years/2027/archive")
    assert res.status_code == 204
    fy = FiscalYear.objects.get(pk=2027)
    assert fy.status == "archived" and fy.archived_by == "manual"
    assert calls == [(2027, fy.archived_at)]
    assert AuditLog.objects.filter(action="arsipkan_tahun_anggaran", entity_id="2027").exists()
    again = admin.post("/api/v1/fiscal-years/2027/archive")
    assert again.status_code == 409 and again.json()["code"] == "archived"


def test_calendar_needs_permission_19(demo: None) -> None:
    res = client_for("usr-andi").post("/api/v1/fiscal-years", {"year": 2028}, format="json")
    assert res.status_code == 403
