from simario.accounts.models import User
from simario.audit.models import AuditLog
from simario.org.models import MonitoringAssignment, Position, PositionOccupancy
from tests.demo import client_for, user

HEADER = "kode_unit,kode_jabatan,nama_jabatan,jenis_jabatan"


def _dry(client, kind: str, text: str):  # type: ignore[no-untyped-def]
    return client.post("/api/v1/imports", {"kind": kind, "text": text}, format="json")


def test_errors_per_row_and_nothing_written_until_clean(demo: None) -> None:
    admin = client_for("usr-admin")
    bad = f"{HEADER}\nDDKB,PPKA1,PPK A-1 Lagi,PPK\nXX,PPKA9,PPK A-9,PPK"
    dry = _dry(admin, "jabatan", bad)
    assert dry.status_code == 201
    job = dry.json()
    assert job["rows"] == 2 and job["valid"] == 0 and job["status"] == "dry_run"
    assert [(e["row"], e["column"]) for e in job["errors"]] == [
        (2, "kode_jabatan"),
        (3, "kode_unit"),
    ]
    assert job["errors"][1]["message"] == 'Unit kerja "XX" tidak dikenal.'
    count = Position.objects.count()
    refused = admin.post(f"/api/v1/imports/{job['id']}/commit")
    assert refused.status_code == 422
    assert refused.json()["code"] == "errors"
    assert refused.json()["message"] == "Perbaiki 2 baris bermasalah terlebih dahulu"
    assert len(refused.json()["details"]) == 2
    assert Position.objects.count() == count

    good = _dry(admin, "jabatan", f"{HEADER}\nDDKB,PPKA3,PPK A-3,PPK").json()
    assert good["errors"] == []
    applied = admin.post(f"/api/v1/imports/{good['id']}/commit")
    assert applied.status_code == 200 and applied.json()["rows"] == 1
    assert Position.objects.count() == count + 1
    history = admin.get("/api/v1/imports").json()
    assert history[0]["kind"] == "jabatan" and history[0]["rows"] == 1
    assert history[0]["actor"] == user("usr-admin").full_name
    again = admin.post(f"/api/v1/imports/{good['id']}/commit")
    assert again.status_code == 409


def test_missing_header_column(demo: None) -> None:
    job = _dry(client_for("usr-admin"), "jabatan", "kode_unit,kode_jabatan\nDDKB,X").json()
    assert job["errors"][0] == {
        "row": 1,
        "column": "nama_jabatan",
        "message": "Kolom wajib tidak ada pada baris judul.",
    }


def test_excel_style_csv(demo: None) -> None:
    text = "﻿kode_unit;kode_jabatan;nama_jabatan;jenis_jabatan\r\nDDKB;PPKA4;PPK A-4;PPK\r\n\r\n"
    job = _dry(client_for("usr-admin"), "jabatan", text).json()
    assert job["errors"] == [] and job["rows"] == 1 and job["valid"] == 1


def test_apply_creates_positions_and_audits(demo: None) -> None:
    admin = client_for("usr-admin")
    job = _dry(admin, "jabatan", f'{HEADER}\nDDKB,PPKA5,"PPK A-5, Konstruksi",PPK').json()
    admin.post(f"/api/v1/imports/{job['id']}/commit")
    pos = Position.objects.get(code="PPKA5")
    assert pos.name == "PPK A-5, Konstruksi"
    assert AuditLog.objects.filter(action="tambah_jabatan", entity_id=str(pos.id)).exists()
    assert AuditLog.objects.filter(action="impor_jabatan", entity_id=job["id"]).exists()


def test_apply_pejabat_and_penugasan(demo: None) -> None:
    admin = client_for("usr-admin")
    pejabat = (
        "nip,nama_lengkap,email,kode_unit,kode_jabatan,nomor_sk,tanggal_sk,tanggal_mulai,pengisi\n"
        "199905052024011009,Raka Putra,raka@ikn.go.id,DSPD,PPKB2,KEP-40/2027,2027-04-01,"
        "2027-04-01,ya"
    )
    job = _dry(admin, "pejabat", pejabat).json()
    assert job["errors"] == []
    assert admin.post(f"/api/v1/imports/{job['id']}/commit").status_code == 200
    raka = User.objects.get(nip="199905052024011009")
    assert PositionOccupancy.objects.filter(user=raka, position__code="PPKB2").exists()
    assert AuditLog.objects.filter(action="tetapkan_jabatan").exists()

    penugasan = (
        "kode_unit_lini1,kode_jabatan_lini1,kode_unit_pj,kode_jabatan_pj,pendukung,tw_mulai,"
        "tw_selesai,nomor_sk\nDSPD,PPKB2,DPDN,PJPM-DPDN,,2027-2,2027-4,KEP-41/2027"
    )
    job = _dry(admin, "penugasan", penugasan).json()
    assert job["errors"] == [], job["errors"]
    assert admin.post(f"/api/v1/imports/{job['id']}/commit").status_code == 200
    assert MonitoringAssignment.objects.filter(target_position__code="PPKB2").exists()


def test_kinds_follow_permissions(demo: None) -> None:
    assert client_for("usr-admin").get("/api/v1/imports/kinds").json() == [
        "jabatan",
        "pejabat",
        "penugasan",
    ]
    assert client_for("usr-nur").get("/api/v1/imports/kinds").json() == ["jabatan"]
    assert client_for("usr-andi").get("/api/v1/imports/kinds").json() == []
    assert _dry(client_for("usr-andi"), "jabatan", HEADER).status_code == 403
    template = client_for("usr-admin").get("/api/v1/imports/templates/pejabat")
    assert template.status_code == 200
    assert template["Content-Type"].startswith("text/csv")
    assert template.content.decode().startswith("nip,nama_lengkap,email,")
