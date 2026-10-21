"""Bulk import (FR-ADM-013). Upload → dry run with a row/column/message report → "Terapkan"
commits every row in one transaction only when there are no errors. Ports
frontend/src/data/api/importer.ts; rows are applied through the module services so audit
entries and session refreshes match the one-by-one screens."""

import datetime as dt
import re
import uuid
from collections.abc import Callable
from functools import partial
from typing import Any

from django.db import transaction

from simario.accounts.models import User
from simario.audit.services import record_by
from simario.calendar.models import Quarter
from simario.core import clock
from simario.core.errors import ApiError
from simario.core.permissions import Actor, has_permission, require_permission
from simario.org import holdings, roles, services
from simario.org.models import (
    MonitoringAssignment,
    OrgUnit,
    Position,
    PositionOccupancy,
    PositionType,
)

from .models import ImportJob

PERMISSION = {"jabatan": 18, "pejabat": 21, "penugasan": 20}
REQUIRED = {
    "jabatan": ["kode_unit", "kode_jabatan", "nama_jabatan", "jenis_jabatan"],
    "pejabat": [
        "nip",
        "nama_lengkap",
        "email",
        "kode_unit",
        "kode_jabatan",
        "nomor_sk",
        "tanggal_sk",
        "tanggal_mulai",
        "pengisi",
    ],
    "penugasan": [
        "kode_unit_lini1",
        "kode_jabatan_lini1",
        "kode_unit_pj",
        "kode_jabatan_pj",
        "pendukung",
        "tw_mulai",
        "tw_selesai",
        "nomor_sk",
    ],
}
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
QUARTER = re.compile(r"^(\d{4})-([1-4])$")
SUPPORT = re.compile(r"^([^/]+)/([^:]+):(kinerja_anggaran|pbj)$")

Op = Callable[[Actor], object]


def parse_csv(text: str) -> list[list[str]]:
    """Minimal RFC 4180 parser (quotes, CRLF, BOM, blank lines). The separator is `;` when the
    header has `;` and no `,` (Excel with an Indonesian locale), otherwise `,`."""
    text = text.removeprefix("﻿")
    first = text.split("\n", 1)[0]
    sep = ";" if ";" in first and "," not in first else ","
    out: list[list[str]] = []
    row: list[str] = []
    cell = ""
    quoted = False
    i = 0
    while i < len(text):
        ch = text[i]
        if quoted:
            if ch == '"' and text[i + 1 : i + 2] == '"':
                cell += '"'
                i += 1
            elif ch == '"':
                quoted = False
            else:
                cell += ch
        elif ch == '"':
            quoted = True
        elif ch == sep:
            row.append(cell)
            cell = ""
        elif ch in "\r\n":
            if ch == "\r" and text[i + 1 : i + 2] == "\n":
                i += 1
            row.append(cell)
            if any(c.strip() for c in row):
                out.append(row)
            row, cell = [], ""
        else:
            cell += ch
        i += 1
    row.append(cell)
    if any(c.strip() for c in row):
        out.append(row)
    return out


def csv_template(kind: str) -> str:
    if kind == "jabatan":
        keys = list(
            dict.fromkeys(
                f"identitas.{f['key']}"
                for t in PositionType.objects.order_by("code")
                for f in t.identity_schema
            )
        )
        example = [
            "Pejabat Pembuat Komitmen A-3" if k.endswith("nama_jabatan_ppk") else "" for k in keys
        ]
        return "\n".join(
            [
                ",".join(["kode_unit", "kode_jabatan", "nama_jabatan", "jenis_jabatan", *keys]),
                ",".join(["DDKB", "PPKA3", "PPK A-3", "PPK", *example]),
            ]
        )
    if kind == "pejabat":
        return (
            "nip,nama_lengkap,email,kode_unit,kode_jabatan,nomor_sk,tanggal_sk,tanggal_mulai,"
            "pengisi\n199812012024011001,Galih Pratama,galih.pratama@ikn.go.id,DSPD,PPKB2,"
            "KEP-40/OIKN/2027,2027-04-01,2027-04-01,ya"
        )
    return (
        "kode_unit_lini1,kode_jabatan_lini1,kode_unit_pj,kode_jabatan_pj,pendukung,tw_mulai,"
        "tw_selesai,nomor_sk\nDSPD,PPKB2,DPDN,PJPM-DPDN,BKBA/UPPM-BKBA:kinerja_anggaran;"
        "BUPBJ/UPPM-UKPBJ:pbj,2027-2,2027-4,KEP-41/OIKN/2027"
    )


def kinds_for(user: User) -> list[str]:
    return [k for k, code in PERMISSION.items() if has_permission(user, code)]


class _Plan:
    def __init__(self, kind: str, text: str, today: dt.date) -> None:
        self.kind = kind
        self.today = today
        table = parse_csv(text)
        self.header = [h.strip() for h in (table[0] if table else [])]
        self.rows = table[1:]
        self.errors: list[dict[str, Any]] = []
        self.ops: list[Op] = []
        self.units = {u.code.lower(): u for u in OrgUnit.objects.all()}
        self.positions = {
            (str(p.org_unit_id), p.code.lower()): p
            for p in Position.objects.select_related("position_type")
        }
        for h in REQUIRED[kind]:
            if h not in self.header:
                self.err(1, h, "Kolom wajib tidak ada pada baris judul.")
        if self.errors:
            return
        check = {"jabatan": self._jabatan, "pejabat": self._pejabat, "penugasan": self._penugasan}
        for i, r in enumerate(self.rows):
            check[kind](i, r)

    def err(self, row: int, column: str, message: str) -> None:
        self.errors.append({"row": row, "column": column, "message": message})

    def col(self, r: list[str], name: str) -> str:
        return (
            r[self.header.index(name)].strip()
            if name in self.header and self.header.index(name) < len(r)
            else ""
        )

    def unit(self, code: str) -> OrgUnit | None:
        return self.units.get(code.lower())

    def pos(self, unit: str, code: str) -> Position | None:
        u = self.unit(unit)
        return self.positions.get((str(u.id), code.lower())) if u else None

    @property
    def valid(self) -> int:
        bad = {e["row"] for e in self.errors if e["row"] > 1}
        return 0 if any(e["row"] == 1 for e in self.errors) else len(self.rows) - len(bad)

    def _jabatan(self, i: int, r: list[str]) -> None:
        n, before, col = i + 2, len(self.errors), self.col
        unit = self.unit(col(r, "kode_unit"))
        kind = col(r, "jenis_jabatan").lower()
        ptype = next(
            (
                t
                for t in PositionType.objects.all()
                if t.code.lower() == kind or t.name.lower() == kind
            ),
            None,
        )
        if not unit:
            self.err(n, "kode_unit", f'Unit kerja "{col(r, "kode_unit")}" tidak dikenal.')
        if not ptype:
            self.err(
                n, "jenis_jabatan", f'Jenis jabatan "{col(r, "jenis_jabatan")}" tidak dikenal.'
            )
        if not col(r, "kode_jabatan"):
            self.err(n, "kode_jabatan", "Kode jabatan wajib diisi.")
        if not col(r, "nama_jabatan"):
            self.err(n, "nama_jabatan", "Nama jabatan wajib diisi.")
        if unit and self.pos(unit.code, col(r, "kode_jabatan")):
            self.err(n, "kode_jabatan", "Kode jabatan sudah dipakai di unit kerja ini (INV-2).")
        if any(
            col(o, "kode_unit") == col(r, "kode_unit")
            and col(o, "kode_jabatan") == col(r, "kode_jabatan")
            for o in self.rows[:i]
        ):
            self.err(n, "kode_jabatan", "Kode jabatan ganda di berkas ini.")
        if len(self.errors) == before and unit and ptype:
            identity = {
                f["key"]: v for f in ptype.identity_schema if (v := col(r, f"identitas.{f['key']}"))
            }
            data = {
                "position_type_id": ptype.id,
                "code": col(r, "kode_jabatan"),
                "name": col(r, "nama_jabatan"),
                "org_unit_id": unit.id,
                "identity": identity,
            }
            self.ops.append(partial(services.save_position, data=data))

    def _pejabat(self, i: int, r: list[str]) -> None:
        n, before, col = i + 2, len(self.errors), self.col
        nip = col(r, "nip")
        pos = self.pos(col(r, "kode_unit"), col(r, "kode_jabatan"))
        if not re.fullmatch(r"\d{18}", nip):
            self.err(n, "nip", "NIP harus 18 digit.")
        if not pos:
            self.err(
                n,
                "kode_jabatan",
                f"Jabatan {col(r, 'kode_unit')}/{col(r, 'kode_jabatan')} tidak dikenal.",
            )
        for f in ("tanggal_sk", "tanggal_mulai"):
            if not ISO_DATE.match(col(r, f)):
                self.err(n, f, "Format tanggal YYYY-MM-DD.")
        if ISO_DATE.match(col(r, "tanggal_mulai")) and col(r, "tanggal_mulai") > (
            self.today.isoformat()
        ):
            self.err(n, "tanggal_mulai", "Tanggal mulai tidak boleh di masa depan.")
        if not col(r, "nomor_sk"):
            self.err(n, "nomor_sk", "Nomor SK wajib diisi.")
        filler = col(r, "pengisi").lower()
        if filler not in ("ya", "tidak"):
            self.err(n, "pengisi", 'Isi "ya" atau "tidak".')
        if pos:
            multi = pos.position_type.allows_multiple_officials
            current = list(
                PositionOccupancy.objects.filter(holdings.active_on(self.today), position=pos)
            )
            user = User.objects.filter(nip=nip).first()
            if not multi and current:
                self.err(
                    n, "kode_jabatan", "Jabatan ini sudah memiliki Pejabat. Gunakan Alih Pejabat."
                )
            if multi and filler == "ya" and any(o.is_filler for o in current):
                self.err(n, "pengisi", "Pokja ini sudah memiliki Pengisi.")
            if user and any(o.user_id == user.id for o in current):
                self.err(n, "nip", "Pengguna ini sudah Pejabat jabatan ini (INV-13).")
            if (
                multi
                and filler == "ya"
                and any(
                    self.pos(col(o, "kode_unit"), col(o, "kode_jabatan")) == pos
                    and col(o, "pengisi").lower() == "ya"
                    for o in self.rows[:i]
                )
            ):
                self.err(n, "pengisi", "Lebih dari satu Pengisi untuk Pokja yang sama.")
        if len(self.errors) == before and pos:
            row = {
                "nip": nip,
                "email": col(r, "email"),
                "full_name": col(r, "nama_lengkap"),
                "position": pos,
                "decree_no": col(r, "nomor_sk"),
                "decree_date": col(r, "tanggal_sk"),
                "start_date": col(r, "tanggal_mulai"),
                "is_filler": filler == "ya",
            }
            self.ops.append(partial(_apply_pejabat, row=row))

    def _penugasan(self, i: int, r: list[str]) -> None:
        n, before, col = i + 2, len(self.errors), self.col
        target = self.pos(col(r, "kode_unit_lini1"), col(r, "kode_jabatan_lini1"))
        lead = self.pos(col(r, "kode_unit_pj"), col(r, "kode_jabatan_pj"))
        if not target:
            self.err(n, "kode_jabatan_lini1", "Jabatan Lini 1 tidak dikenal.")
        if not lead:
            self.err(n, "kode_jabatan_pj", "Jabatan penanggung jawab tidak dikenal.")

        def quarter(s: str) -> Quarter | None:
            m = QUARTER.match(s)
            return (
                Quarter.objects.filter(fiscal_year_id=int(m[1]), number=int(m[2])).first()
                if m
                else None
            )

        q_from = quarter(col(r, "tw_mulai"))
        q_to = quarter(col(r, "tw_selesai"))
        if not q_from:
            self.err(n, "tw_mulai", 'Format triwulan "2027-1" dan TA harus ada.')
        if not q_to:
            self.err(n, "tw_selesai", 'Format triwulan "2027-1" dan TA harus ada.')
        supports = []
        for part in (s.strip() for s in col(r, "pendukung").split(";")):
            if not part:
                continue
            m = SUPPORT.match(part)
            p = self.pos(m[1], m[2]) if m else None
            if not m or not p:
                self.err(n, "pendukung", f'Pendukung "{part}" tidak valid.')
            else:
                domain = "procurement" if m[3] == "pbj" else "budget_performance"
                supports.append({"position_id": p.id, "domain": domain})

        def key(q: Quarter) -> int:
            return q.fiscal_year_id * 10 + q.number

        if q_from and q_to and key(q_from) > key(q_to):
            self.err(n, "tw_selesai", "Triwulan akhir sebelum triwulan awal.")
        if target and q_from and q_to:
            clash = any(
                key(x.quarter_from) <= key(q_to) and key(q_from) <= key(x.quarter_to)
                for x in MonitoringAssignment.objects.filter(target_position=target).select_related(
                    "quarter_from", "quarter_to"
                )
            )
            if clash:
                self.err(
                    n,
                    "kode_jabatan_lini1",
                    f"{target.name} sudah memiliki penanggung jawab pada rentang ini (INV-14).",
                )
        if not col(r, "nomor_sk"):
            self.err(n, "nomor_sk", "Nomor SK wajib diisi.")
        if len(self.errors) == before and target and lead and q_from and q_to:
            data = {
                "target_position_ids": [target.id],
                "lead_position_id": lead.id,
                "supports": supports,
                "quarter_from_id": str(q_from.id),
                "quarter_to_id": str(q_to.id),
                "decree_no": col(r, "nomor_sk"),
            }
            self.ops.append(partial(roles.add_assignments, data=data))


def _apply_pejabat(actor: Actor, row: dict[str, Any]) -> None:
    pos: Position = row["position"]
    user = User.objects.filter(nip=row["nip"]).first()
    if user is None:
        user = User.objects.create_user(
            nip=row["nip"],
            email=row["email"],
            full_name=row["full_name"],
            created_via="admin",
            org_unit_id=pos.org_unit_id,
        )
    # Decree file may follow: the holding carries "SK belum diunggah".
    holdings.apply_assignment(
        actor,
        {
            "user_id": user.id,
            "position_id": pos.id,
            "decree_no": row["decree_no"],
            "decree_date": row["decree_date"],
            "decree_file": None,
            "start_date": row["start_date"],
            "is_filler": row["is_filler"],
        },
    )


@transaction.atomic
def dry_run(user: User, kind: str, text: str) -> ImportJob:
    require_permission(user, PERMISSION[kind])
    plan = _Plan(kind, text, clock.today())
    return ImportJob.objects.create(
        kind=kind,
        rows=len(plan.rows),
        valid=plan.valid,
        errors=plan.errors,
        content=text,
        created_by=user,
        created_at=clock.now(),
    )


@transaction.atomic
def commit(user: User, job_id: uuid.UUID) -> ImportJob:
    job = ImportJob.objects.select_for_update().get(pk=job_id)
    actor = require_permission(user, PERMISSION[job.kind])
    if job.status == "applied":
        raise ApiError("applied", "Impor ini sudah diterapkan.")
    # Data may have changed since the dry run: check again before writing anything.
    plan = _Plan(job.kind, job.content, dt.date.fromisoformat(actor.today))
    if plan.errors:
        rows = len({e["row"] for e in plan.errors})
        raise ApiError("errors", f"Perbaiki {rows} baris bermasalah terlebih dahulu", plan.errors)
    for op in plan.ops:
        op(actor)
    job.status = "applied"
    job.applied_at = actor.at
    job.rows, job.valid, job.errors = len(plan.rows), plan.valid, []
    job.save()
    record_by(actor, f"impor_{job.kind}", "ImportJob", job.id, None, {"rows": job.rows})
    return job


def history() -> list[ImportJob]:
    return list(
        ImportJob.objects.filter(status="applied")
        .select_related("created_by")
        .order_by("-applied_at")
    )
