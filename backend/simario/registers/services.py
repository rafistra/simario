"""Register mutations (PRD §5, FR-REG-001 … 013). Ports registerApi in
frontend/src/data/api/register.ts: same checks, error copy, audit actions and notifications.
Content actions need a holding on the register's position (INV-25): drafting = permission 2
(Pokja: Pengisi or Operator, INV-24); publishing and deactivating = permission 3, Pejabat only
(INV-12)."""

import datetime as dt
import re
import uuid
from dataclasses import dataclass
from typing import Any

from django.db import transaction
from django.db.models import Max

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.assessments.models import RiskQuarter
from simario.audit.services import record
from simario.calendar.models import FiscalYear, Quarter
from simario.core import clock
from simario.core.errors import ApiError
from simario.domain import access
from simario.domain import register as rules
from simario.domain.calendar import quarter_containing
from simario.notifications.services import notify
from simario.org.models import Position, PositionOccupancy
from simario.reference.models import (
    DataUmumForm,
    MitigationTemplate,
    RiskProposal,
    RiskTemplate,
    Stage,
)

from .models import Register, RegisterMitigation, RegisterRisk, RegisterStageDeclaration
from .selectors import pending_items, permission_rows, register_db, would_flag_no_mitigation

DENY = {
    "permission": "Anda tidak memiliki izin untuk tindakan ini.",
    "holding": "Tindakan ini hanya untuk pemegang jabatan ini.",
    "official": "Tindakan akhir dilakukan oleh Pejabat.",
    "filler": "Hanya Pengisi dan Operator yang ditunjuknya yang dapat menyusun register ini.",
}
RISK_PUBLISHED = "Risiko yang sudah diterbitkan tidak dapat dihapus. Gunakan Nonaktifkan."
MITIGATION_PUBLISHED = "Mitigasi yang sudah diterbitkan tidak dapat dihapus. Gunakan Nonaktifkan."
REASON_REQUIRED = "Alasan penonaktifan wajib diisi."


@dataclass(frozen=True)
class ContentActor:
    user: User
    at: dt.datetime
    today: dt.date
    capacity: str
    position: Position


def require_content(user: User, code: int, position: Position) -> ContentActor:
    today = clock.today()
    res = access.check_action(
        load_access_db(), permission_rows(), str(user.id), code, str(position.id), today.isoformat()
    )
    if not res["ok"]:
        raise ApiError("forbidden", DENY[res["reason"]])
    return ContentActor(user, clock.now(), today, res["holding"]["capacity"], position)


def _audit(
    a: ContentActor, action: str, entity_type: str, entity_id: Any, before: Any, after: Any
) -> None:
    record(
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id),
        actor=a.user,
        acting_as=a.capacity,
        acting_position=a.position,
        before=before,
        after=after,
        at=a.at,
    )


def _assert_writable(fiscal_year: int) -> None:
    if FiscalYear.objects.filter(pk=fiscal_year, status="archived").exists():
        raise ApiError(
            "archived", "Tahun anggaran ini sudah diarsipkan. Register hanya dapat dibaca."
        )


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip())


def _position(position_id: Any) -> Position:
    return Position.objects.get(pk=position_id)


def _register_of(position: Position, fiscal_year: int, lock: bool = True) -> Register | None:
    qs = Register.objects.filter(position=position, fiscal_year_id=fiscal_year)
    return (qs.select_for_update() if lock else qs).first()


def ensure_register(a: ContentActor, fiscal_year: int) -> Register:
    """Creates the register on first edit (INV-1: one per position per fiscal year)."""
    existing = _register_of(a.position, fiscal_year)
    if existing:
        return existing
    form = DataUmumForm.objects.get(position_type_id=a.position.position_type_id, active=True)
    reg = Register.objects.create(
        position=a.position,
        fiscal_year_id=fiscal_year,
        status="draft",
        data_umum={
            "tujuan": form.default_objective if form.objective_enabled else "",
            "kegiatan": [],
            "besar_anggaran": None,
            "target": "",
            "extra": {},
        },
        data_umum_form=form,
        updated_at=a.at,
        updated_by=a.user,
    )
    _audit(a, "buat_register", "Register", reg.id, None, {"fiscalYear": fiscal_year})
    return reg


def _touch(reg: Register, a: ContentActor) -> None:
    """Any edit marks the autosave time; an edit after "Siap" returns the register to Draf."""
    reg.updated_at = a.at
    reg.updated_by = a.user
    if reg.status == "ready":
        reg.status = "draft"
        reg.ready_at = None
        reg.ready_by = None
    reg.save()


def _touch_item(item: RegisterRisk | RegisterMitigation) -> None:
    """Edits to a published register affect additions only: a ready addition returns to draft."""
    if item.status == "ready":
        item.status = "draft"
        item.ready_at = None
        item.save(update_fields=["status", "ready_at"])


def _recompute_no_mitigation(risk: RegisterRisk) -> None:
    if not risk.published_at:
        return
    has_active = risk.mitigations.filter(status="active").exists()
    flagged = "no_mitigation" in risk.flags
    if not has_active and not flagged:
        risk.flags = [*risk.flags, "no_mitigation"]
    elif has_active and flagged:
        risk.flags = [f for f in risk.flags if f != "no_mitigation"]
    else:
        return
    risk.save(update_fields=["flags"])


def _clear_declaration_for(reg: Register, stage_id: Any, risk_type: str) -> None:
    """Adding a risk removes "tidak ada risiko" of its sub-section (FR-REG-008)."""
    RegisterStageDeclaration.objects.filter(
        register=reg, stage_id=stage_id, risk_type=risk_type
    ).delete()


def _assert_stage_open(reg: Register, stage_id: Any) -> None:
    if RegisterStageDeclaration.objects.filter(
        register=reg, stage_id=stage_id, kind="stage_not_relevant"
    ).exists():
        raise ApiError(
            "stage_not_relevant",
            "Tahap ini dinyatakan tidak relevan. Batalkan pernyataan tahap terlebih dahulu.",
        )


def _is_published(m: RegisterMitigation) -> bool:
    """Seed mitigations carry no published_at; active/inactive status means published."""
    return bool(m.published_at) or m.status in ("active", "inactive")


def _risk_context(
    user: User, risk_id: Any, code: int
) -> tuple[RegisterRisk, Register, ContentActor]:
    risk = RegisterRisk.objects.select_related("register__position").get(pk=risk_id)
    reg = risk.register
    a = require_content(user, code, reg.position)
    _assert_writable(reg.fiscal_year_id)
    return risk, reg, a


# ---------- drafting ----------


@transaction.atomic
def toggle_template_risk(
    user: User, position_id: Any, fiscal_year: int, template_id: Any, selected: bool
) -> None:
    a = require_content(user, 2, _position(position_id))
    _assert_writable(fiscal_year)
    reg = ensure_register(a, fiscal_year)
    tpl = RiskTemplate.objects.get(pk=template_id)
    existing = (
        RegisterRisk.objects.filter(register=reg, risk_template=tpl)
        .exclude(status="inactive")
        .first()
    )
    if selected and not existing:
        _assert_stage_open(reg, tpl.stage_id)
        _clear_declaration_for(reg, tpl.stage_id, tpl.risk_type)
        rid = uuid.uuid4()
        # Template mitigations are NOT pre-ticked (FR-REG-003).
        RegisterRisk.objects.create(
            id=rid,
            register=reg,
            stage_id=tpl.stage_id,
            risk_type=tpl.risk_type,
            risk_template=tpl,
            description_snapshot=tpl.description,
            is_custom=False,
            status="draft",
            lineage_id=f"lin-{rid}",
            flags=[],
            order=tpl.order,
            created_at=a.at,
            created_by=user,
        )
        _audit(a, "pilih_risiko", "RegisterRisk", rid, None, {"template": tpl.code})
    elif not selected and existing:
        if existing.published_at:
            raise ApiError("published", RISK_PUBLISHED)
        before = {"description": existing.description_snapshot}
        eid = existing.id
        existing.delete()
        _audit(a, "hapus_risiko_draf", "RegisterRisk", eid, before, None)
    _touch(reg, a)


@transaction.atomic
def add_custom_risk(
    user: User, position_id: Any, fiscal_year: int, stage_id: Any, risk_type: str, description: str
) -> uuid.UUID:
    a = require_content(user, 2, _position(position_id))
    _assert_writable(fiscal_year)
    text = _norm(description)
    if not text:
        raise ApiError("validation", "Uraian risiko wajib diisi.")
    reg = ensure_register(a, fiscal_year)
    _assert_stage_open(reg, stage_id)
    _clear_declaration_for(reg, stage_id, risk_type)
    rid = uuid.uuid4()
    RegisterRisk.objects.create(
        id=rid,
        register=reg,
        stage_id=stage_id,
        risk_type=risk_type,
        description_snapshot=text,
        is_custom=True,
        status="draft",
        lineage_id=f"lin-{rid}",
        flags=[],
        order=999,
        created_at=a.at,
        created_by=user,
    )
    _audit(a, "tambah_risiko_sendiri", "RegisterRisk", rid, None, {"description": text})
    _touch(reg, a)
    return rid


@transaction.atomic
def delete_risk(user: User, risk_id: Any) -> None:
    risk, reg, a = _risk_context(user, risk_id, 2)
    if risk.published_at:
        raise ApiError("published", RISK_PUBLISHED)
    before = {"description": risk.description_snapshot}
    risk.delete()
    _audit(a, "hapus_risiko_draf", "RegisterRisk", risk_id, before, None)
    _touch(reg, a)


@transaction.atomic
def toggle_template_mitigation(
    user: User, risk_id: Any, mitigation_template_id: Any, selected: bool
) -> None:
    risk, reg, a = _risk_context(user, risk_id, 2)
    existing = (
        RegisterMitigation.objects.filter(
            register_risk=risk, mitigation_template_id=mitigation_template_id
        )
        .exclude(status="inactive")
        .first()
    )
    if selected and not existing:
        tpl = MitigationTemplate.objects.get(pk=mitigation_template_id)
        m = RegisterMitigation.objects.create(
            register_risk=risk,
            mitigation_template=tpl,
            description_snapshot=tpl.description,
            is_custom=False,
            order=tpl.order,
            status="draft",
            created_at=a.at,
            created_by=user,
        )
        _audit(
            a, "pilih_mitigasi", "RegisterMitigation", m.id, None, {"description": tpl.description}
        )
    elif not selected and existing:
        if _is_published(existing):
            raise ApiError("published", MITIGATION_PUBLISHED)
        before = {"description": existing.description_snapshot}
        mid = existing.id
        existing.delete()
        _audit(a, "hapus_mitigasi_draf", "RegisterMitigation", mid, before, None)
    if not risk.published_at:
        _touch_item(risk)
    _touch(reg, a)


@transaction.atomic
def add_custom_mitigation(user: User, risk_id: Any, text: str) -> None:
    risk, reg, a = _risk_context(user, risk_id, 2)
    description = _norm(text)
    if not description:
        raise ApiError("validation", "Uraian mitigasi wajib diisi.")
    top = risk.mitigations.aggregate(m=Max("order"))["m"] or 0
    m = RegisterMitigation.objects.create(
        register_risk=risk,
        description_snapshot=description,
        is_custom=True,
        order=max(0, top) + 1,
        status="draft",
        created_at=a.at,
        created_by=user,
    )
    _audit(
        a, "tambah_mitigasi_sendiri", "RegisterMitigation", m.id, None, {"description": description}
    )
    _touch(reg, a)


@transaction.atomic
def delete_mitigation(user: User, mitigation_id: Any) -> None:
    m = RegisterMitigation.objects.select_related("register_risk").get(pk=mitigation_id)
    _, reg, a = _risk_context(user, m.register_risk_id, 2)
    if _is_published(m):
        raise ApiError("published", MITIGATION_PUBLISHED)
    before = {"description": m.description_snapshot}
    m.delete()
    _audit(a, "hapus_mitigasi_draf", "RegisterMitigation", mitigation_id, before, None)
    _touch(reg, a)


@transaction.atomic
def set_declaration(
    user: User,
    position_id: Any,
    fiscal_year: int,
    stage_id: Any,
    risk_type: str | None,
    on: bool,
    force: bool = False,
) -> None:
    """ "Tidak ada risiko pada jenis ini" (risk_type) or "Tahap ini tidak relevan" (None).
    Draft risks of the section are removed only with `force`; published risks forbid it."""
    a = require_content(user, 2, _position(position_id))
    _assert_writable(fiscal_year)
    reg0 = _register_of(a.position, fiscal_year)
    affected = list(
        RegisterRisk.objects.filter(register=reg0, stage_id=stage_id)
        if reg0
        else RegisterRisk.objects.none()
    )
    if risk_type is not None:
        affected = [r for r in affected if r.risk_type == risk_type]
    if on and any(r.published_at for r in affected):
        raise ApiError(
            "has_published",
            "Bagian ini memuat risiko yang sudah diterbitkan. Nonaktifkan risiko tersebut "
            "alih-alih menyatakan tidak ada risiko.",
        )
    if on and affected and not force:
        raise ApiError(
            "has_drafts",
            f"{len(affected)} risiko terpilih akan dihapus dari bagian ini.",
            {"count": len(affected)},
        )
    reg = ensure_register(a, fiscal_year)
    decls = RegisterStageDeclaration.objects.filter(register=reg, stage_id=stage_id)
    if on:
        RegisterRisk.objects.filter(pk__in=[r.pk for r in affected]).delete()
        if risk_type is None:
            decls.delete()
        if not decls.filter(risk_type=risk_type).exists():
            RegisterStageDeclaration.objects.create(
                register=reg,
                stage_id=stage_id,
                risk_type=risk_type,
                kind="no_risk_in_type" if risk_type else "stage_not_relevant",
                reason="",
            )
    else:
        decls.filter(risk_type=risk_type).delete()
    _audit(
        a,
        "nyatakan" if on else "batalkan_pernyataan",
        "RegisterStageDeclaration",
        f"{stage_id}:{risk_type or 'tahap'}",
        None,
        {"register": str(reg.id), "on": on, "removedRisks": len(affected)},
    )
    _touch(reg, a)


@transaction.atomic
def set_declaration_reason(
    user: User,
    position_id: Any,
    fiscal_year: int,
    stage_id: Any,
    risk_type: str | None,
    reason: str,
) -> None:
    a = require_content(user, 2, _position(position_id))
    _assert_writable(fiscal_year)
    reg = _register_of(a.position, fiscal_year)
    decl = (
        RegisterStageDeclaration.objects.filter(
            register=reg, stage_id=stage_id, risk_type=risk_type
        ).first()
        if reg
        else None
    )
    if reg is None or decl is None or decl.reason == reason:
        return
    _audit(
        a,
        "ubah_alasan_pernyataan",
        "RegisterStageDeclaration",
        decl.id,
        {"reason": decl.reason},
        {"reason": reason},
    )
    decl.reason = reason
    decl.save(update_fields=["reason"])
    _touch(reg, a)


DATA_UMUM_KEYS = ("tujuan", "kegiatan", "besar_anggaran", "target", "extra")


@transaction.atomic
def update_data_umum(user: User, position_id: Any, fiscal_year: int, patch: dict[str, Any]) -> None:
    """Data Umum stays editable for Lini 1 after publishing; changes are audited (FR-REG-001)."""
    a = require_content(user, 2, _position(position_id))
    _assert_writable(fiscal_year)
    reg = ensure_register(a, fiscal_year)
    patch = {k: v for k, v in patch.items() if k in DATA_UMUM_KEYS}
    du = dict(reg.data_umum)
    before = {k: du.get(k) for k in patch}
    du.update({k: v for k, v in patch.items() if k != "extra"})
    du["extra"] = {**(du.get("extra") or {}), **(patch.get("extra") or {})}
    reg.data_umum = du
    _audit(a, "ubah_data_umum", "Register", reg.id, before, patch)
    _touch(reg, a)


# ---------- ready, publish, deactivate, copy ----------


@transaction.atomic
def mark_ready(user: User, position_id: Any, fiscal_year: int) -> None:
    """Operator hands over: draft → ready; the Pejabat is notified (FR-REG-006, FR-NTF-001)."""
    a = require_content(user, 2, _position(position_id))
    _assert_writable(fiscal_year)
    reg = _register_of(a.position, fiscal_year)
    if reg is None:
        raise ApiError("empty", "Register masih kosong.")
    published = reg.status == "published"
    pending = pending_items(register_db(a.position), str(reg.id))
    if published and not pending["risks"] and not pending["mitigations"]:
        raise ApiError("nothing", "Tidak ada tambahan yang perlu ditandai siap.")
    before = reg.status
    RegisterRisk.objects.filter(register=reg, status="draft").update(status="ready", ready_at=a.at)
    RegisterMitigation.objects.filter(register_risk__register=reg, status="draft").update(
        status="ready", ready_at=a.at
    )
    if not published:
        reg.status = "ready"
        reg.ready_at = a.at
        reg.ready_by = user
    reg.updated_at = a.at
    reg.updated_by = user
    reg.save()
    what = "register tambahan" if published else "register"
    for occ in PositionOccupancy.objects.filter(
        position=a.position, is_filler=True, end_date__isnull=True
    ).select_related("user"):
        notify(
            user=occ.user,
            kind="ready",
            text=f"{user.full_name} menandai {what} {a.position.name} siap untuk Anda tuntaskan",
            target_url=f"/jabatan/{a.position.id}/register/{fiscal_year}",
            event_key=f"register-ready:{reg.id}:{a.at.isoformat()}",
            at=a.at,
        )
    _audit(
        a,
        "tandai_siap_tambahan" if published else "tandai_siap_register",
        "Register",
        reg.id,
        {"status": before},
        {"status": reg.status},
    )


def _current_quarter(today: dt.date) -> Quarter | None:
    rows = [
        {"id": q.id, "starts_on": q.starts_on.isoformat(), "ends_on": q.ends_on.isoformat()}
        for q in Quarter.objects.all()
    ]
    found = quarter_containing(rows, today.isoformat())
    return Quarter.objects.get(pk=found["id"]) if found else None


@transaction.atomic
def publish(user: User, position_id: Any, fiscal_year: int) -> dict[str, Any]:
    """Publish (FR-REG-007) or publish additions (FR-REG-008). Structural gaps block with a list;
    no_mitigation is a flag. Wording locks (INV-7), custom risks become proposals, risks enter the
    current quarter's assessment (RB-REG-006), Lini 2 is notified (FR-NTF-002)."""
    a = require_content(user, 3, _position(position_id))
    _assert_writable(fiscal_year)
    reg = _register_of(a.position, fiscal_year)
    if reg is None:
        raise ApiError("empty", "Register masih kosong.")
    db = register_db(a.position)
    gaps = rules.register_gaps(db, str(reg.id))
    if gaps:
        raise ApiError(
            "gaps", f"Register belum dapat diterbitkan: {len(gaps)} hal perlu dilengkapi", gaps
        )
    pending = pending_items(db, str(reg.id))
    risks, mitigations = pending["risks"], pending["mitigations"]
    if reg.status == "published" and not risks and not mitigations:
        raise ApiError("nothing", "Tidak ada tambahan yang perlu diterbitkan.")
    flagged = [
        {"id": r["id"], "description": r["description_snapshot"]}
        for r in would_flag_no_mitigation(db, str(reg.id))
    ]
    risk_ids = [r["id"] for r in risks]
    mit_ids = [m["id"] for m in mitigations]
    RegisterRisk.objects.filter(pk__in=risk_ids).update(
        status="active", published_at=a.at, ready_at=None
    )
    RegisterMitigation.objects.filter(pk__in=mit_ids).update(
        status="active", published_at=a.at, ready_at=None
    )
    touched = set(risk_ids) | {m["register_risk_id"] for m in mitigations}
    for risk in RegisterRisk.objects.filter(pk__in=touched):
        _recompute_no_mitigation(risk)
    customs = [r for r in risks if r["is_custom"]]
    for r in customs:
        RiskProposal.objects.create(
            source_register_risk_id=r["id"],
            description=r["description_snapshot"],
            proposer_id=r["created_by_user_id"] or user.id,
            status="pending",
            created_at=a.at,
        )
    quarter = _current_quarter(a.today)
    if quarter and quarter.fiscal_year_id == fiscal_year:
        for rid in risk_ids:
            RiskQuarter.objects.get_or_create(register_risk_id=rid, quarter=quarter)
    first = reg.status != "published"
    before = reg.status
    reg.status = "published"
    if first:
        reg.published_at = a.at
        reg.published_by = user
    reg.ready_at = None
    reg.ready_by = None
    reg.updated_at = a.at
    reg.updated_by = user
    reg.save()
    # FR-NTF-002: holders of the assigned Lini 2 lead and support positions.
    if quarter:
        adb = load_access_db()
        lini2 = set(access.assigned_lini2(adb, str(a.position.id), str(quarter.id)))
        today = a.today.isoformat()
        for u in User.objects.filter(is_active=True):
            if any(h["position_id"] in lini2 for h in access.holdings_of(adb, str(u.id), today)):
                notify(
                    user=u,
                    kind="register_published",
                    text=(f"{a.position.name} menerbitkan {len(risk_ids)} risiko TA {fiscal_year}"),
                    target_url=f"/jabatan/{a.position.id}/register/{fiscal_year}",
                    event_key=f"register-published:{reg.id}:{a.at.isoformat()}",
                    at=a.at,
                )
    _audit(
        a,
        "terbitkan_register" if first else "terbitkan_tambahan",
        "Register",
        reg.id,
        {"status": before},
        {"status": "published", "risks": len(risk_ids), "mitigations": len(mit_ids)},
    )
    return {
        "risks": len(risks),
        "mitigations": len(mitigations),
        "flagged": flagged,
        "proposals": len(customs),
    }


def _next_quarter(today: dt.date, fiscal_year: int) -> Quarter | None:
    current = _current_quarter(today)
    if current is None or current.fiscal_year_id != fiscal_year or current.number == 4:
        return None
    return Quarter.objects.filter(fiscal_year_id=fiscal_year, number=current.number + 1).first()


@transaction.atomic
def deactivate_risk(user: User, risk_id: Any, reason: str) -> None:
    """FR-REG-010: Pejabat only, reason required; assessed until the next quarter (TW IV: rest
    of the year)."""
    risk, reg, a = _risk_context(user, risk_id, 3)
    if not reason.strip():
        raise ApiError("validation", REASON_REQUIRED)
    start = _next_quarter(a.today, reg.fiscal_year_id)
    risk.status = "inactive"
    risk.deactivated_at = a.at
    risk.deactivated_from_quarter = start
    risk.deactivation_reason = reason.strip()
    risk.save()
    _audit(
        a,
        "nonaktifkan_risiko",
        "RegisterRisk",
        risk.id,
        {"status": "active"},
        {
            "status": "inactive",
            "fromQuarter": str(start.id) if start else None,
            "reason": reason.strip(),
        },
    )


@transaction.atomic
def deactivate_mitigation(user: User, mitigation_id: Any, reason: str) -> None:
    m = RegisterMitigation.objects.get(pk=mitigation_id)
    risk, _, a = _risk_context(user, m.register_risk_id, 3)
    if not reason.strip():
        raise ApiError("validation", REASON_REQUIRED)
    m.status = "inactive"
    m.deactivation_reason = reason.strip()
    m.save(update_fields=["status", "deactivation_reason"])
    _recompute_no_mitigation(risk)
    _audit(
        a,
        "nonaktifkan_mitigasi",
        "RegisterMitigation",
        m.id,
        {"status": "active"},
        {"status": "inactive", "reason": reason.strip()},
    )


@transaction.atomic
def copy_from_previous(user: User, position_id: Any, fiscal_year: int) -> dict[str, Any]:
    """FR-REG-009: only when the current register has no risks. Nothing is published."""
    a = require_content(user, 2, _position(position_id))
    _assert_writable(fiscal_year)
    prev = _register_of(a.position, fiscal_year - 1, lock=False)
    if prev is None:
        raise ApiError("no_previous", f"Tidak ada register TA {fiscal_year - 1} untuk disalin.")
    current = _register_of(a.position, fiscal_year)
    if current and current.risks.exists():
        raise ApiError(
            "not_empty", "Register sudah berisi risiko; salin hanya untuk register kosong."
        )
    stages = {s.id: s for s in Stage.objects.filter(position_type_id=a.position.position_type_id)}
    source = list(
        prev.risks.filter(status="active").select_related("risk_template").order_by("order")
    )
    skipped: dict[str, int] = {}
    for r in source:
        if not stages[r.stage_id].active:
            name = stages[r.stage_id].name
            skipped[name] = skipped.get(name, 0) + 1
    summary: dict[str, Any] = {
        "risks": 0,
        "mitigations": 0,
        "inactive_templates": 0,
        "skipped_stages": [{"name": n, "risks": c} for n, c in skipped.items()],
        "from_year": prev.fiscal_year_id,
    }
    reg = ensure_register(a, fiscal_year)
    reg.data_umum = {**prev.data_umum, "besar_anggaran": None, "target": ""}
    reg.copied_from = prev
    for decl in prev.declarations.all():
        if stages[decl.stage_id].active:
            RegisterStageDeclaration.objects.create(
                register=reg,
                stage_id=decl.stage_id,
                risk_type=decl.risk_type,
                kind=decl.kind,
                reason=decl.reason,
            )
    for r in source:
        if not stages[r.stage_id].active:
            continue
        inactive_tpl = bool(r.risk_template and not r.risk_template.active)
        if inactive_tpl:
            summary["inactive_templates"] += 1
        new = RegisterRisk.objects.create(
            register=reg,
            stage_id=r.stage_id,
            risk_type=r.risk_type,
            risk_template=r.risk_template,
            description_snapshot=r.description_snapshot,
            is_custom=r.is_custom,
            status="draft",
            previous_year_risk=r,
            lineage_id=r.lineage_id,
            flags=["template_inactive"] if inactive_tpl else [],
            order=r.order,
            created_at=a.at,
            created_by=user,
        )
        summary["risks"] += 1
        for m in r.mitigations.filter(status="active"):
            RegisterMitigation.objects.create(
                register_risk=new,
                mitigation_template=m.mitigation_template,
                description_snapshot=m.description_snapshot,
                is_custom=m.is_custom,
                order=m.order,
                status="draft",
                created_at=a.at,
                created_by=user,
            )
            summary["mitigations"] += 1
    _audit(
        a,
        "salin_register",
        "Register",
        reg.id,
        None,
        {
            "risks": summary["risks"],
            "mitigations": summary["mitigations"],
            "inactiveTemplates": summary["inactive_templates"],
            "skippedStages": summary["skipped_stages"],
            "fromYear": summary["from_year"],
        },
    )
    _touch(reg, a)
    return summary
