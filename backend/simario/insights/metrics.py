"""Product metrics (FR-ADM-011). Ports buildMetrics and metricsCsv in
frontend/src/data/api/insights.ts; shared vectors in shared/test-vectors/metrics.json."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from simario.domain import assessment as rules
from simario.domain import board as board_rules
from simario.domain.index import by

Row = dict[str, Any]
Db = dict[str, Any]
ROMAN = ("I", "II", "III", "IV")


def _ratio(n: int, d: int) -> float | None:
    return None if d == 0 else n / d


def _tw(n: int) -> str:
    return f"TW {ROMAN[n - 1]}"


def _positions_of_line(db: Db, line: int) -> list[Row]:
    types = {t["id"] for t in db["position_types"] if t["line"] == line}
    return [p for p in db["positions"] if p["position_type_id"] in types]


def _point(label: str, n: int, d: int) -> Row:
    return {"label": label, "value": _ratio(n, d), "numerator": n, "denominator": d}


def _last(points: list[Row], *, overall_only: bool = False) -> Row | None:
    for p in reversed(points):
        if p["denominator"] > 0 and not (overall_only and "·" in p["label"]):
            return p
    return None


def build_metrics(db: Db, year: int, at: str) -> list[Row]:
    today = at[:10]
    reg_ids = {
        r["id"]
        for r in db["registers"]
        if r["fiscal_year"] == year
        and (r.get("published_at") or r["status"] in ("published", "archived"))
    }
    published = [
        r
        for r in db["risks"]
        if r["register_id"] in reg_ids and r["status"] in ("active", "inactive")
    ]
    quarters = sorted(
        (q for q in db["quarters"] if q["fiscal_year"] == year), key=lambda q: q["number"]
    )
    started = [q for q in quarters if q["starts_on"] <= today]
    lini1 = _positions_of_line(db, 1)

    # 1. Templates.
    from_tpl = len([r for r in published if not r["is_custom"]])
    m1 = {
        "objective": 1,
        "title": "Risiko dari template pusat",
        "target": "≥ 80%",
        "query": "RegisterRisk terbit TA terpilih: risk_template_id terisi ÷ semua",
        "value": _ratio(from_tpl, len(published)),
        "unit": "percent",
        "status": "",
        "insufficient": None if published else "Belum ada register yang terbit pada TA ini.",
        "points": [_point(f"TA {year}", from_tpl, len(published))],
    }

    # 2. Langkah coverage per quarter (RB-REG-006).
    p2 = []
    for q in started:
        items = [x for p in lini1 for x in rules.quarter_risks(db, p["id"], q)]
        with_step = len(
            [1 for risk, _ in items if board_rules.has_langkah(db, risk["id"], q["id"])]
        )
        p2.append(_point(_tw(q["number"]), with_step, len(items)))
    last2 = _last(p2)
    m2 = {
        "objective": 2,
        "title": "Risiko dengan Langkah Lini 1 per triwulan",
        "target": "≥ 80%",
        "query": "Risiko dinilai pada triwulan (RB-REG-006) dengan ≥ 1 komentar Langkah Lini 1 "
        "pada triwulan itu ÷ semua",
        "value": last2["value"] if last2 else None,
        "unit": "percent",
        "status": "",
        "insufficient": None if last2 else "Belum ada triwulan berjalan dengan risiko terbit.",
        "points": p2,
    }

    # 3. Evidence completeness of final Lini 1 scores.
    rq_by_quarter = by(db, "risk_quarters", "quarter_id")
    p3 = []
    for q in started:
        rq_ids = {r["id"] for r in rq_by_quarter.get((q["id"],), [])}
        finals = [
            a
            for a in db["assessments"]
            if a["risk_quarter_id"] in rq_ids
            and a["assessor_line"] == 1
            and a["status"] == "final"
            and not a["not_relevant"]
        ]
        with_file = len([a for a in finals if "no_evidence" not in a["flags"]])
        p3.append(_point(_tw(q["number"]), with_file, len(finals)))
    last3 = _last(p3)
    m3 = {
        "objective": 3,
        "title": "Penilaian Lini 1 dengan bukti",
        "target": "≥ 90%",
        "query": "Assessment Lini 1 final (bukan Belum relevan) tanpa penanda no_evidence ÷ semua "
        "final",
        "value": last3["value"] if last3 else None,
        "unit": "percent",
        "status": "",
        "insufficient": None if last3 else "Belum ada penilaian Lini 1 yang dituntaskan.",
        "points": p3,
    }

    # 4. Recurring risks and explanations (VIS-7: opened results only).
    quarter_ids = {q["id"] for q in quarters}

    def sent(rq: Row) -> bool:
        return any(
            r["explanation_status"] == "sent" for r in board_rules.opened_results(db, rq["id"], at)
        )

    recurring = [
        rq
        for rq in db["risk_quarters"]
        if rq["quarter_id"] in quarter_ids
        and rq["recurring"]
        and board_rules.opened_results(db, rq["id"], at)
    ]
    explained = len([rq for rq in recurring if sent(rq)])
    p4 = []
    for q in started:
        r = [x for x in recurring if x["quarter_id"] == q["id"]]
        e = len([x for x in r if sent(x)])
        p4.append(
            {"label": _tw(q["number"]), "value": len(r), "numerator": e, "denominator": len(r)}
        )
    m4 = {
        "objective": 4,
        "title": "Risiko Berulang terdeteksi",
        "target": "Semua ditandai & diberitahukan",
        "query": "RiskQuarter recurring = true (hasil terbuka) · dengan penjelasan terkirim",
        "value": len(recurring),
        "unit": "count",
        "status": f"{explained} dari {len(recurring)} menerima penjelasan",
        "insufficient": None if started else "Belum ada triwulan berjalan.",
        "points": p4,
    }

    # 8. Time on task — requires time-on-page instrumentation.
    m8 = {
        "objective": 8,
        "title": "Median waktu menuntaskan penilaian triwulan",
        "target": "< 30 menit",
        "query": "Median waktu-di-halaman per jabatan per triwulan hingga Tuntaskan Penilaian",
        "value": None,
        "unit": "minutes",
        "status": "",
        "insufficient": "Instrumentasi waktu-di-halaman belum tersedia di prototipe; angka tidak "
        "ditebak dari selisih waktu.",
        "points": [],
    }

    # 9. Alignment per quarter and per Lini 3 position.
    lini3 = _positions_of_line(db, 3)
    rq_quarter = {rq["id"]: rq["quarter_id"] for rq in db["risk_quarters"]}
    p9 = []
    for q in started:
        results = [
            r
            for r in db["results"]
            if rq_quarter.get(r["risk_quarter_id"]) == q["id"]
            and r["opened_at"][:16] <= at[:16]
            and r["result"] != "incomparable"
        ]
        ok = len([r for r in results if r["result"] == "sesuai"])
        p9.append(_point(_tw(q["number"]), ok, len(results)))
        for p in lini3:
            own = [r for r in results if r["lini3_position_id"] == p["id"]]
            s = len([r for r in own if r["result"] == "sesuai"])
            label = f"{_tw(q['number'])} · {p.get('short_name') or p['code']}"
            p9.append(_point(label, s, len(own)))
    last9 = _last(p9, overall_only=True)
    m9 = {
        "objective": 9,
        "title": "Tingkat kesesuaian Lini 1 dan Lini 3",
        "target": "Tanpa target v1.0 — garis dasar",
        "query": "ComparisonResult terbuka: Sesuai ÷ (Sesuai + Tidak Sesuai), per triwulan dan per "
        "direktorat",
        "value": last9["value"] if last9 else None,
        "unit": "percent",
        "status": "",
        "insufficient": None if last9 else "Belum ada hasil perbandingan yang terbuka.",
        "points": p9,
    }

    cards: list[Row] = [m1, m2, m3]
    for m in cards:
        target = 0.9 if m["objective"] == 3 else 0.8
        value = m["value"]
        if value is None:
            m["status"] = ""
        else:
            m["status"] = "Memenuhi target" if value >= target else "Di bawah target"
    return [m1, m2, m3, m4, m8, m9]


def _csv_text(s: str) -> str:
    """A quoted CSV field; embedded quotes are doubled."""
    return '"' + s.replace('"', '""') + '"'


def _fixed1(x: float) -> str:
    """Number.prototype.toFixed(1): the exact binary value, ties away from zero."""
    return str(Decimal(x).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def metrics_csv(cards: list[Row], year: int) -> str:
    lines = ["tujuan,judul,periode,nilai,pembilang,penyebut"]
    for c in cards:
        points = c["points"] or [
            {"label": f"TA {year}", "value": None, "numerator": 0, "denominator": 0}
        ]
        for p in points:
            if p["value"] is None:
                value = ""
            elif c["unit"] == "percent":
                value = _fixed1(p["value"] * 100)
            else:
                value = str(p["value"])
            lines.append(
                ",".join(
                    [
                        str(c["objective"]),
                        _csv_text(c["title"]),
                        _csv_text(p["label"]),
                        value,
                        str(p["numerator"]),
                        str(p["denominator"]),
                    ]
                )
            )
    return "\n".join(lines)
