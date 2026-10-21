"""Stages, risk templates and Data Umum forms (FR-MST-001…006). Ports masterApi in
frontend/src/data/api/master.ts: same checks, error copy and audit actions."""

import re
import uuid
from typing import Any

from django.db import transaction
from django.db.models import Max

from simario.audit.services import record_by
from simario.core.errors import ApiError
from simario.core.permissions import Actor
from simario.registers import usage

from .models import DataUmumForm, MitigationTemplate, RiskTemplate, Stage


def _norm(s: str) -> str:
    return " ".join(s.split()).lower()


def _next_stage_order(position_type_id: Any, exclude: Any = None) -> int:
    qs = Stage.objects.filter(position_type_id=position_type_id, active=True)
    if exclude:
        qs = qs.exclude(pk=exclude)
    return (qs.aggregate(m=Max("order"))["m"] or 0) + 1


def _check_stage_name(position_type_id: Any, name: str, stage_id: Any = None) -> None:
    if not name.strip():
        raise ApiError("validation", "Nama tahap wajib diisi.")
    others = Stage.objects.filter(position_type_id=position_type_id)
    if stage_id:
        others = others.exclude(pk=stage_id)
    if any(_norm(s.name) == _norm(name) for s in others):
        raise ApiError("validation", "Nama tahap sudah dipakai pada jenis ini.")


@transaction.atomic
def add_stage(actor: Actor, position_type_id: uuid.UUID, name: str) -> uuid.UUID:
    _check_stage_name(position_type_id, name)
    order = _next_stage_order(position_type_id)
    stage = Stage.objects.create(
        position_type_id=position_type_id, name=name.strip(), order=order, active=True
    )
    record_by(
        actor, "tambah_tahap", "Stage", stage.id, None, {"name": name.strip(), "order": order}
    )
    return stage.id


@transaction.atomic
def rename_stage(actor: Actor, stage_id: uuid.UUID, name: str) -> None:
    stage = Stage.objects.select_for_update().get(pk=stage_id)
    _check_stage_name(stage.position_type_id, name, stage.id)
    record_by(
        actor, "ubah_nama_tahap", "Stage", stage.id, {"name": stage.name}, {"name": name.strip()}
    )
    stage.name = name.strip()
    stage.save(update_fields=["name"])


@transaction.atomic
def reorder_stages(actor: Actor, position_type_id: uuid.UUID, ordered_ids: list[str]) -> None:
    before = [
        str(s.id)
        for s in Stage.objects.filter(position_type_id=position_type_id, active=True).order_by(
            "order"
        )
    ]
    for i, sid in enumerate(ordered_ids):
        Stage.objects.filter(pk=sid).update(order=i + 1)
    record_by(
        actor,
        "urutkan_tahap",
        "PositionType",
        position_type_id,
        {"order": before},
        {"order": [str(i) for i in ordered_ids]},
    )


@transaction.atomic
def set_stage_active(actor: Actor, stage_id: uuid.UUID, active: bool) -> None:
    stage = Stage.objects.select_for_update().get(pk=stage_id)
    stage.active = active
    if active:
        stage.order = _next_stage_order(stage.position_type_id, exclude=stage.id)
    stage.save(update_fields=["active", "order"])
    record_by(
        actor,
        "aktifkan_tahap" if active else "nonaktifkan_tahap",
        "Stage",
        stage.id,
        {"active": not active},
        {"active": active},
    )


@transaction.atomic
def delete_stage(actor: Actor, stage_id: uuid.UUID) -> None:
    if usage.stage_used(stage_id):
        raise ApiError(
            "stage_in_use",
            "Tahap ini dipakai register sehingga tidak dapat dihapus, hanya dinonaktifkan.",
        )
    if RiskTemplate.objects.filter(stage_id=stage_id).exists():
        raise ApiError(
            "stage_has_templates",
            "Tahap ini masih punya template. Hapus atau pindahkan templatenya terlebih dahulu.",
        )
    stage = Stage.objects.get(pk=stage_id)
    before = {
        "id": str(stage.id),
        "position_type_id": str(stage.position_type_id),
        "name": stage.name,
        "order": stage.order,
        "active": stage.active,
    }
    stage.delete()
    record_by(actor, "hapus_tahap", "Stage", stage_id, before, None)


def _mitigation_texts(template: RiskTemplate) -> list[str]:
    return [m.description for m in template.mitigations.order_by("order")]


@transaction.atomic
def save_template(
    actor: Actor, data: dict[str, Any], template_id: uuid.UUID | None = None
) -> uuid.UUID:
    description = " ".join(data["description"].split())
    if not description:
        raise ApiError("validation", "Uraian risiko wajib diisi.")
    same = RiskTemplate.objects.filter(stage_id=data["stage_id"], risk_type=data["risk_type"])
    if template_id:
        same = same.exclude(pk=template_id)
    if any(_norm(t.description) == _norm(description) for t in same):
        raise ApiError("validation", "Uraian ini sudah ada pada tahap dan jenis risiko yang sama.")
    # Empty mitigation lines are dropped on save; a template without mitigations is allowed.
    mitigations = [m.strip() for m in data.get("mitigations", []) if m.strip()]
    after = {"description": description, "mitigations": mitigations}
    if template_id:
        tpl = RiskTemplate.objects.select_for_update().get(pk=template_id)
        before = {"description": tpl.description, "mitigations": _mitigation_texts(tpl)}
        tpl.description = description
        tpl.updated_at = actor.at.date()
        tpl.save(update_fields=["description", "updated_at"])
        tpl.mitigations.all().delete()
        action = "ubah_template"
    else:
        order = (
            RiskTemplate.objects.filter(
                stage_id=data["stage_id"], risk_type=data["risk_type"]
            ).aggregate(m=Max("order"))["m"]
            or 0
        ) + 1
        new_id = uuid.uuid4()
        tpl = RiskTemplate.objects.create(
            id=new_id,
            code=f"TPL-{new_id.hex[:8].upper()}",
            position_type_id=data["position_type_id"],
            stage_id=data["stage_id"],
            risk_type=data["risk_type"],
            description=description,
            order=order,
            active=True,
            updated_at=actor.at.date(),
        )
        before = None
        action = "tambah_template"
    MitigationTemplate.objects.bulk_create(
        MitigationTemplate(
            code=f"{tpl.code}-M{i + 1}",
            risk_template=tpl,
            description=text,
            order=i + 1,
            active=True,
        )
        for i, text in enumerate(mitigations)
    )
    record_by(actor, action, "RiskTemplate", tpl.id, before, after)
    return tpl.id


@transaction.atomic
def set_template_active(actor: Actor, template_id: uuid.UUID, active: bool) -> None:
    tpl = RiskTemplate.objects.select_for_update().get(pk=template_id)
    tpl.active = active
    tpl.updated_at = actor.at.date()
    tpl.save(update_fields=["active", "updated_at"])
    record_by(
        actor,
        "aktifkan_template" if active else "nonaktifkan_template",
        "RiskTemplate",
        tpl.id,
        {"active": not active},
        {"active": active},
    )


@transaction.atomic
def delete_template(actor: Actor, template_id: uuid.UUID) -> None:
    if usage.template_ever_used(template_id):
        raise ApiError(
            "template_used",
            "Template yang pernah dipakai register tidak dapat dihapus, hanya dinonaktifkan.",
        )
    tpl = RiskTemplate.objects.get(pk=template_id)
    before = {"code": tpl.code, "description": tpl.description, "active": tpl.active}
    tpl.delete()
    record_by(actor, "hapus_template", "RiskTemplate", template_id, before, None)


def template_usage(fiscal_year: int) -> dict[str, int]:
    """{template id: registers of the fiscal year using it}, non-zero entries only."""
    counts = {
        str(t.id): usage.template_usage(t.id, fiscal_year) for t in RiskTemplate.objects.only("id")
    }
    return {k: v for k, v in counts.items() if v}


FIXED_LABELS = {"tujuan", "kegiatan", "besar anggaran", "target"}


@transaction.atomic
def save_data_umum_form(
    actor: Actor,
    position_type_id: uuid.UUID,
    default_objective: str,
    fields: list[dict[str, Any]],
    objective_enabled: bool = False,
) -> int:
    errors: dict[str, str] = {}
    seen = set(FIXED_LABELS)
    for i, f in enumerate(fields):
        key = _norm(f.get("label", ""))
        if not key:
            errors[str(i)] = "Label isian wajib diisi."
        elif key in seen:
            errors[str(i)] = "Label isian sudah dipakai."
        seen.add(key)
        if f.get("kind") == "list" and len([o for o in f.get("options") or [] if o.strip()]) < 2:
            errors[str(i)] = "Tambahkan minimal dua pilihan."
    if errors:
        raise ApiError("validation", "Periksa kembali isian tambahan.", errors)
    current = DataUmumForm.objects.select_for_update().filter(position_type_id=position_type_id)
    version = (current.aggregate(m=Max("version"))["m"] or 0) + 1
    current.update(active=False)
    form = DataUmumForm.objects.create(
        position_type_id=position_type_id,
        version=version,
        objective_enabled=objective_enabled,
        default_objective=default_objective.strip(),
        active=True,
        created_at=actor.at.date(),
        fields=[
            {
                **f,
                "label": f["label"].strip(),
                "key": f.get("key") or re.sub(r"\W+", "_", _norm(f["label"])),
            }
            for f in fields
        ],
    )
    record_by(
        actor,
        "simpan_formulir_data_umum",
        "DataUmumForm",
        form.id,
        {"version": version - 1},
        {"version": version, "fields": len(fields)},
    )
    return version
