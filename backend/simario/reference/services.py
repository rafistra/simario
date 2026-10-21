"""Stages, risk templates and Data Umum forms (FR-MST-001…006). Ports masterApi in
frontend/src/data/api/master.ts: same checks, error copy and audit actions."""

import datetime as dt
import re
import uuid
from typing import Any

from django.db import IntegrityError, transaction
from django.db.models import Max

from simario.audit.services import record_by
from simario.core.errors import ApiError
from simario.core.permissions import Actor
from simario.domain.score_bands import validate_bands
from simario.domain.score_options import sort_options, validate_options
from simario.org.models import PositionType
from simario.registers import usage

from .models import (
    DataUmumForm,
    MitigationTemplate,
    RiskTemplate,
    ScoreBand,
    ScoreBandVersion,
    ScoreOption,
    Stage,
)


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
    # aggregate() drops FOR UPDATE: lock the position type so the next version number is unique.
    PositionType.objects.select_for_update().get(pk=position_type_id)
    current = DataUmumForm.objects.filter(position_type_id=position_type_id)
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


# ---------- Score bands and statements (FR-MST-007, PRD v2.8) ----------

DRAFT_EXISTS = "Sudah ada draf versi. Lanjutkan atau buang draf tersebut terlebih dahulu."


def _band_rows(version_id: Any) -> list[dict[str, Any]]:
    return [
        {
            "lower_exclusive": float(b.lower_exclusive) if b.lower_exclusive is not None else None,
            "upper_inclusive": float(b.upper_inclusive),
            "predicate": b.predicate,
            "order": b.order,
            "guidance": b.guidance,
        }
        for b in ScoreBand.objects.filter(version_id=version_id).order_by("order")
    ]


def _replace_bands_and_options(
    version: ScoreBandVersion, bands: list[dict[str, Any]], options: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    ScoreBand.objects.filter(version=version).delete()
    ScoreBand.objects.bulk_create(
        ScoreBand(
            version=version,
            lower_exclusive=b.get("lower_exclusive"),
            upper_inclusive=b["upper_inclusive"],
            predicate=b["predicate"],
            order=b["order"],
            guidance=b.get("guidance", ""),
        )
        for b in bands
    )
    ScoreOption.objects.filter(version=version).delete()
    saved = [
        ScoreOption(version=version, value=o["value"], label=o["label"].strip(), order=i + 1)
        for i, o in enumerate(sort_options(options))
    ]
    ScoreOption.objects.bulk_create(saved)
    return [
        {"id": str(o.id), "value": float(o.value), "label": o.label, "order": o.order}
        for o in saved
    ]


@transaction.atomic
def create_band_draft(actor: Actor, effective_from: dt.date) -> uuid.UUID:
    if ScoreBandVersion.objects.filter(status="draft").exists():
        raise ApiError("draft_exists", DRAFT_EXISTS)
    if effective_from < actor.at.date():
        raise ApiError("validation", "Tanggal berlaku tidak boleh sebelum hari ini.")
    active = ScoreBandVersion.objects.get(status="active")
    number = (ScoreBandVersion.objects.aggregate(m=Max("number"))["m"] or 0) + 1
    try:
        with transaction.atomic():
            draft = ScoreBandVersion.objects.create(
                number=number, effective_from=effective_from, status="draft"
            )
    except IntegrityError as e:
        raise ApiError("draft_exists", DRAFT_EXISTS) from e
    ScoreBand.objects.bulk_create(
        ScoreBand(
            version=draft,
            lower_exclusive=b.lower_exclusive,
            upper_inclusive=b.upper_inclusive,
            predicate=b.predicate,
            order=b.order,
            guidance=b.guidance,
        )
        for b in active.bands.all()
    )
    ScoreOption.objects.bulk_create(
        ScoreOption(version=draft, value=o.value, label=o.label, order=o.order)
        for o in active.options.all()
    )
    record_by(
        actor,
        "buat_draf_skala",
        "ScoreBandVersion",
        draft.id,
        None,
        {
            "number": number,
            "effective_from": effective_from.isoformat(),
            "copied_from": active.number,
        },
    )
    return draft.id


@transaction.atomic
def save_band_version(
    actor: Actor,
    version_id: uuid.UUID,
    effective_from: dt.date,
    bands: list[dict[str, Any]],
    options: list[dict[str, Any]],
) -> None:
    """A valid draft becomes `scheduled`; the score_bands task activates it on its date."""
    version = ScoreBandVersion.objects.select_for_update().filter(pk=version_id).first()
    if version is None or version.status != "draft":
        raise ApiError("validation", "Hanya draf versi yang dapat disimpan.")
    problems = validate_bands(bands)  # type: ignore[arg-type]
    if effective_from < actor.at.date():
        raise ApiError("validation", "Tanggal berlaku tidak boleh sebelum hari ini.")
    if problems:
        raise ApiError("bands_invalid", "Rentang tidak dapat disimpan", problems)
    option_problems = validate_options(options, bands)  # type: ignore[arg-type]
    if option_problems:
        raise ApiError("options_invalid", "Pilihan penilaian tidak dapat disimpan", option_problems)
    version.effective_from = effective_from
    version.status = "scheduled"
    version.save(update_fields=["effective_from", "status"])
    saved = _replace_bands_and_options(version, bands, options)
    record_by(
        actor,
        "simpan_versi_skala",
        "ScoreBandVersion",
        version.id,
        {"status": "draft"},
        {
            "status": "scheduled",
            "effective_from": effective_from.isoformat(),
            "bands": bands,
            "options": saved,
        },
    )


@transaction.atomic
def update_band_draft(
    actor: Actor,
    version_id: uuid.UUID,
    bands: list[dict[str, Any]],
    effective_from: dt.date,
    options: list[dict[str, Any]],
) -> None:
    """Keeps draft edits without validation (autosave of the table and guidance)."""
    version = ScoreBandVersion.objects.select_for_update().get(pk=version_id)
    if version.status != "draft":
        return
    version.effective_from = effective_from
    version.save(update_fields=["effective_from"])
    _replace_bands_and_options(version, bands, options)


@transaction.atomic
def discard_band_draft(actor: Actor, version_id: uuid.UUID) -> None:
    version = ScoreBandVersion.objects.filter(pk=version_id).first()
    if version is None or version.status not in ("draft", "scheduled"):
        return
    number = version.number
    version.delete()
    record_by(actor, "buang_draf_skala", "ScoreBandVersion", version_id, {"number": number}, None)


@transaction.atomic
def update_active_guidance(actor: Actor, predicate: str, guidance: str) -> None:
    active = ScoreBandVersion.objects.get(status="active")
    band = ScoreBand.objects.select_for_update().get(version=active, predicate=predicate)
    record_by(
        actor,
        "ubah_panduan_skala",
        "ScoreBand",
        f"{active.id}:{predicate}",
        {"guidance": band.guidance},
        {"guidance": guidance},
    )
    band.guidance = guidance
    band.save(update_fields=["guidance"])


@transaction.atomic
def update_option_label(actor: Actor, option_id: uuid.UUID, label: str) -> None:
    """Statement text of the active version; values change only through a new version."""
    option = ScoreOption.objects.select_related("version").filter(pk=option_id).first()
    if option is None or option.version.status != "active":
        raise ApiError("validation", "Kalimat hanya dapat diubah langsung pada versi aktif.")
    siblings: list[dict[str, Any]] = [
        {"id": str(o.id), "value": float(o.value), "label": o.label}
        for o in ScoreOption.objects.filter(version=option.version).exclude(pk=option.id)
    ]
    # validate_options flags the later of two duplicates, so the edited option goes last.
    siblings.append({"id": str(option.id), "value": float(option.value), "label": label})
    bands = _band_rows(option.version_id)
    problems = [
        p
        for p in validate_options(siblings, bands)  # type: ignore[arg-type]
        if p.get("option_id") == str(option.id)
    ]
    if problems:
        raise ApiError("options_invalid", "Kalimat tidak dapat disimpan", problems)
    record_by(
        actor,
        "ubah_kalimat_penilaian",
        "ScoreOption",
        option.id,
        {"label": option.label},
        {"label": label.strip()},
    )
    option.label = label.strip()
    option.save(update_fields=["label"])
