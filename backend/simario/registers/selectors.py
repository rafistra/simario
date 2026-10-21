"""Register read model (PRD §5, FR-REG-012). Ports buildRegisterView in
frontend/src/data/api/registerView.ts: which items a viewer receives is decided here. Holders of
the position see drafts and unpublished additions; every other reader in scope sees published
items only, and nothing of a register that has never been published."""

import uuid
from typing import Any

from simario.accounts.models import User
from simario.accounts.selectors import load_access_db
from simario.calendar.models import FiscalYear, Quarter
from simario.calendar.serializers import QuarterSerializer
from simario.core import clock
from simario.core.collections import DataUmumFormRow, RiskTemplateRow, StageRow
from simario.core.errors import ApiError
from simario.domain import access
from simario.domain import register as rules
from simario.org.models import Permission, Position
from simario.reference.models import DataUmumForm, RiskTemplate, Stage

from .models import Register, RegisterMitigation, RegisterRisk, RegisterStageDeclaration
from .serializers import DeclarationRow, MitigationRow, RegisterRow, RiskRow

Row = dict[str, Any]


def _rows(serializer: Any, qs: Any) -> list[Row]:
    return [dict(r) for r in serializer(qs, many=True).data]


def permission_rows() -> list[Row]:
    return [dict(p) for p in Permission.objects.values("code", "requires_official", "is_drafting")]


def register_db(position: Position) -> rules.Db:
    """The rows simario.domain.register needs for one position (all its fiscal years)."""
    registers = Register.objects.filter(position=position)
    risks = RegisterRisk.objects.filter(register__in=registers)
    return {
        "registers": _rows(RegisterRow, registers),
        "risks": _rows(RiskRow, risks),
        "mitigations": _rows(
            MitigationRow, RegisterMitigation.objects.filter(register_risk__in=risks)
        ),
        "declarations": _rows(
            DeclarationRow, RegisterStageDeclaration.objects.filter(register__in=registers)
        ),
        "stages": _rows(StageRow, Stage.objects.filter(position_type_id=position.position_type_id)),
        "positions": [
            {
                "id": str(position.id),
                "position_type_id": str(position.position_type_id),
                "org_unit_id": str(position.org_unit_id),
            }
        ],
        "data_umum_forms": _rows(
            DataUmumFormRow, DataUmumForm.objects.filter(position_type_id=position.position_type_id)
        ),
        "quarters": _rows(QuarterSerializer, Quarter.objects.all()),
        "risk_templates": _rows(
            RiskTemplateRow, RiskTemplate.objects.filter(position_type_id=position.position_type_id)
        ),
    }


def register_access(user: User, position: Position, fiscal_year: int) -> Row:
    db = load_access_db()
    perms = permission_rows()
    today = clock.today().isoformat()
    uid, pid = str(user.id), str(position.id)
    archived = FiscalYear.objects.filter(pk=fiscal_year, status="archived").exists()
    draft = access.check_action(db, perms, uid, 2, pid, today)
    publish = access.check_action(db, perms, uid, 3, pid, today)
    holding = next((h for h in access.holdings_of(db, uid, today) if h["position_id"] == pid), None)
    official = access.finalising_official(db, pid, today)
    return {
        "can_draft": draft["ok"] and not archived,
        "can_publish": publish["ok"] and not archived,
        "is_holder": holding is not None,
        "is_operator": bool(holding and holding["capacity"] == "operator"),
        "draft_denied": None if draft["ok"] else draft["reason"],
        "archived": archived,
        "official_name": official["full_name"] if official else None,
    }


def assert_can_read(user: User, position_id: str, fiscal_year: int | None) -> None:
    db = load_access_db()
    today = clock.today().isoformat()
    if not access.can_read_position(db, str(user.id), position_id, today, fiscal_year):
        raise ApiError("forbidden", "Anda tidak memiliki akses ke jabatan ini.")


def _published(x: Row) -> bool:
    return x["status"] in ("active", "inactive")


def pending_items(db: rules.Db, register_id: str) -> dict[str, list[Row]]:
    """Items a publish would cover: everything still draft or ready."""
    risk_ids = {r["id"] for r in db["risks"] if r["register_id"] == register_id}
    return {
        "risks": [
            r
            for r in db["risks"]
            if r["register_id"] == register_id and r["status"] in ("draft", "ready")
        ],
        "mitigations": [
            m
            for m in db["mitigations"]
            if m["register_risk_id"] in risk_ids and m["status"] in ("draft", "ready")
        ],
    }


def would_flag_no_mitigation(db: rules.Db, register_id: str) -> list[Row]:
    """Risks that would publish without an active mitigation (flag, not a block)."""
    return [
        r
        for r in pending_items(db, register_id)["risks"]
        if not any(
            m["register_risk_id"] == r["id"] and m["status"] != "inactive"
            for m in db["mitigations"]
        )
    ]


def _stages(
    db: rules.Db, register: Row | None, position: Position, acc: Row, editing: bool
) -> list[Row]:
    def visible(x: Row) -> bool:
        return bool(acc["is_holder"]) or _published(x)

    if register:
        stages = rules.register_stages(db, register)
    else:
        stages = sorted((s for s in db["stages"] if s["active"]), key=lambda s: s["order"])
    active = [s for s in stages if s["active"]]
    out = []
    for stage in stages:
        decls = (
            [
                d
                for d in db["declarations"]
                if d["register_id"] == register["id"] and d["stage_id"] == stage["id"]
            ]
            if register
            else []
        )
        stage_decl = next((d for d in decls if d["kind"] == "stage_not_relevant"), None)
        subsections = []
        for rt in rules.RISK_TYPES:
            risks = (
                sorted(
                    (
                        r
                        for r in db["risks"]
                        if r["register_id"] == register["id"]
                        and r["stage_id"] == stage["id"]
                        and r["risk_type"] == rt
                        and visible(r)
                    ),
                    key=lambda r: (r["is_custom"], r["order"]),
                )
                if register
                else []
            )
            mitigations = {
                r["id"]: sorted(
                    (
                        m
                        for m in db["mitigations"]
                        if m["register_risk_id"] == r["id"] and visible(m)
                    ),
                    key=lambda m: m["order"],
                )
                for r in risks
            }
            used = {r["risk_template_id"] for r in risks if r["status"] != "inactive"}
            templates = (
                sorted(
                    (
                        t
                        for t in db["risk_templates"]
                        if t["stage_id"] == stage["id"]
                        and t["risk_type"] == rt
                        and t["active"]
                        and t["id"] not in used
                    ),
                    key=lambda t: t["order"],
                )
                if editing and stage["active"]
                else []
            )
            decl = next((d for d in decls if d["risk_type"] == rt), None)
            subsections.append(
                {
                    "stage": stage,
                    "risk_type": rt,
                    "risks": risks,
                    "mitigations": mitigations,
                    "templates": templates,
                    "declaration": {"reason": decl["reason"]} if decl else None,
                }
            )
        out.append(
            {
                "stage": stage,
                "index": active.index(stage) + 1 if stage in active else 0,
                "total": len(active),
                "not_relevant": {"reason": stage_decl["reason"]} if stage_decl else None,
                "subsections": subsections,
            }
        )
    return out


def build_register_view(user: User, position_id: uuid.UUID, fiscal_year: int) -> Row:
    """The register as this viewer may see it (FR-REG-012), plus what the page derives from it:
    whether last year's register exists (copy banner), stage completion, risks that would be
    flagged without mitigation."""
    position = Position.objects.filter(pk=position_id).first()
    if position is None:
        raise ApiError("not_found", "Jabatan tidak ditemukan.")
    assert_can_read(user, str(position.id), fiscal_year)
    acc = register_access(user, position, fiscal_year)
    editing = bool(acc["can_draft"])
    db = register_db(position)
    stored = next((r for r in db["registers"] if r["fiscal_year"] == fiscal_year), None)
    unpublished_for_reader = (
        stored is not None
        and not acc["is_holder"]
        and stored["status"] not in ("published", "archived")
        and not acc["archived"]
    )
    register = stored if stored and not unpublished_for_reader else None

    def visible(x: Row) -> bool:
        return bool(acc["is_holder"]) or _published(x)

    rid = register["id"] if register else None
    return {
        "register": register,
        "unpublished_for_reader": unpublished_for_reader,
        "access": acc,
        "stages": _stages(db, register, position, acc, editing),
        "risks": [r for r in db["risks"] if r["register_id"] == rid and visible(r)],
        "pending": pending_items(db, rid)
        if rid and acc["is_holder"]
        else {"risks": [], "mitigations": []},
        "gaps": rules.register_gaps(db, rid) if rid and editing else [],
        "previous_register": any(r["fiscal_year"] == fiscal_year - 1 for r in db["registers"]),
        "stages_done": rules.complete_stages(db, rid)
        if rid
        else {"complete": 0, "total": len([s for s in db["stages"] if s["active"]])},
        "flagged": would_flag_no_mitigation(db, rid) if rid and acc["is_holder"] else [],
    }
