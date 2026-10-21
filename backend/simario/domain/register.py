"""Register rules (PRD §5, §2.6, RB-REG-006, INV-7). Mirrors frontend/src/domain/rules/register.ts;
shared vectors in shared/test-vectors/register.json. Rows are plain dicts with snake_case keys,
string ids and ISO date strings."""

from collections.abc import Mapping, Sequence
from typing import Any

from .index import one

Row = dict[str, Any]
Db = Mapping[str, Sequence[Row]]

RISK_TYPES = ("kinerja_anggaran", "ketidakpatuhan", "kecurangan")
RISK_TYPE_LABEL = {
    "kinerja_anggaran": "Kinerja Anggaran",
    "ketidakpatuhan": "Ketidakpatuhan",
    "kecurangan": "Kecurangan",
}
ROMAN = ("I", "II", "III", "IV")


def _find(rows: Sequence[Row], key: str, value: Any) -> Row | None:
    return next((r for r in rows if r.get(key) == value), None)


def subsection_anchor(stage_id: str, risk_type: str) -> str:
    return f"sub-{stage_id}-{risk_type}"


def stage_anchor(stage_id: str) -> str:
    return f"stage-{stage_id}"


def data_umum_anchor(field: str) -> str:
    return f"du-{field}"


def register_stages(db: Db, register: Row) -> list[Row]:
    """The type's active stages plus any inactive stage the register already uses."""
    position = _find(db["positions"], "id", register["position_id"])
    assert position is not None
    used = {r["stage_id"] for r in db["risks"] if r["register_id"] == register["id"]} | {
        d["stage_id"] for d in db["declarations"] if d["register_id"] == register["id"]
    }
    stages = [
        s
        for s in db["stages"]
        if s["position_type_id"] == position["position_type_id"]
        and (s["active"] or s["id"] in used)
    ]
    return sorted(stages, key=lambda s: (not s["active"], s["order"]))


def _counts_for_section(risk: Row) -> bool:
    """Everything except deleted; inactive still counts (it was published)."""
    return risk["status"] != "inactive" or risk.get("published_at") is not None


def register_gaps(db: Db, register_id: str) -> list[Row]:
    """Structural gaps that block publishing (§2.6). Risks without mitigation are flags."""
    register = _find(db["registers"], "id", register_id)
    assert register is not None
    gaps: list[Row] = []
    du = register["data_umum"]
    form = _find(db["data_umum_forms"], "id", register["data_umum_form_id"])

    def missing(field: str, label: str) -> None:
        gaps.append(
            {
                "kind": "dataUmum",
                "field": field,
                "anchor": data_umum_anchor(field),
                "message": f"Data Umum — {label} wajib diisi sebelum register diterbitkan.",
            }
        )

    if not any(k.strip() for k in du.get("kegiatan") or []):
        missing("kegiatan", "Kegiatan")
    budget = du.get("besar_anggaran")
    if budget is None or budget <= 0:
        missing("besarAnggaran", "Besar Anggaran")
    if not (du.get("target") or "").strip():
        missing("target", "Target")
    extra = du.get("extra") or {}
    for f in (form or {}).get("fields") or []:
        if f.get("mandatory") and not (extra.get(f["key"]) or "").strip():
            missing(f["key"], f["label"])

    stages = [s for s in register_stages(db, register) if s["active"]]
    for i, stage in enumerate(stages):
        decls = [
            d
            for d in db["declarations"]
            if d["register_id"] == register_id and d["stage_id"] == stage["id"]
        ]
        stage_decl = next((d for d in decls if d["kind"] == "stage_not_relevant"), None)
        if stage_decl:
            if not stage_decl["reason"].strip():
                gaps.append(
                    {
                        "kind": "reason",
                        "stage_id": stage["id"],
                        "anchor": stage_anchor(stage["id"]),
                        "message": (
                            f"Tahap {i + 1} · {stage['name']} — alasan tahap tidak relevan "
                            "wajib diisi."
                        ),
                    }
                )
            continue
        for rt in RISK_TYPES:
            decl = next((d for d in decls if d["risk_type"] == rt), None)
            risks = [
                r
                for r in db["risks"]
                if r["register_id"] == register_id
                and r["stage_id"] == stage["id"]
                and r["risk_type"] == rt
                and _counts_for_section(r)
            ]
            anchor = subsection_anchor(stage["id"], rt)
            if decl and not decl["reason"].strip():
                gaps.append(
                    {
                        "kind": "reason",
                        "stage_id": stage["id"],
                        "risk_type": rt,
                        "anchor": anchor,
                        "message": (
                            f"Tahap {i + 1} · {RISK_TYPE_LABEL[rt]} — alasan “Tidak ada risiko "
                            "pada jenis ini” wajib diisi."
                        ),
                    }
                )
            elif not decl and not risks:
                gaps.append(
                    {
                        "kind": "subsection",
                        "stage_id": stage["id"],
                        "risk_type": rt,
                        "anchor": anchor,
                        "message": (
                            f"Tahap {i + 1} · {RISK_TYPE_LABEL[rt]} — belum ada risiko atau "
                            "pernyataan “Tidak ada risiko pada jenis ini”."
                        ),
                    }
                )
    return gaps


def complete_stages(db: Db, register_id: str) -> dict[str, int]:
    register = _find(db["registers"], "id", register_id)
    assert register is not None
    stages = [s for s in register_stages(db, register) if s["active"]]
    incomplete = {g["stage_id"] for g in register_gaps(db, register_id) if g.get("stage_id")}
    return {
        "complete": len([s for s in stages if s["id"] not in incomplete]),
        "total": len(stages),
    }


def deactivation_quarter(quarters: Sequence[Row], current: Row) -> Row | None:
    """Next quarter of the same fiscal year, or None in TW IV."""
    if current["number"] == 4:
        return None
    return next(
        (
            q
            for q in quarters
            if q["fiscal_year"] == current["fiscal_year"] and q["number"] == current["number"] + 1
        ),
        None,
    )


def inactive_label(quarter: Row | None, fiscal_year: int) -> str:
    """Badge text for a deactivated item (FR-REG-010)."""
    if quarter:
        return f"Nonaktif sejak TW {ROMAN[quarter['number'] - 1]}"
    return f"Nonaktif mulai TA {fiscal_year + 1}"


def assessed_in_quarter(db: Db, risk: Row, quarter: Row) -> bool:
    """RB-REG-006: assessed from the quarter it was published in up to, not including,
    deactivated_from_quarter — whatever its current status."""
    if not risk.get("published_at"):
        return False
    register = one(db, "registers", "id", risk["register_id"])
    assert register is not None
    if register["fiscal_year"] != quarter["fiscal_year"]:
        return False
    if risk["published_at"][:10] > quarter["ends_on"]:
        return False
    if risk["status"] == "inactive":
        if not risk.get("deactivated_from_quarter_id"):
            return True
        start = one(db, "quarters", "id", risk["deactivated_from_quarter_id"])
        assert start is not None
        return bool(quarter["number"] < start["number"])
    return True
