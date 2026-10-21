"""Closing a fiscal year's assessments when it is archived (§2.5). Ports the assessment part of
the archive in frontend/src/data/api/calendar.ts: unfinished assessments become "Tidak dinilai",
partial comparisons count as open, mandatory explanations not sent become "Tidak dikirim"."""

import datetime as dt
from typing import Any

from simario.calendar.services import on_archive
from simario.domain import assessment as rules
from simario.domain import board as board_rules

from .models import Assessment, ComparisonResult, RiskQuarter
from .selectors import assessment_db


@on_archive
def close_assessments(fy: Any, at: dt.datetime) -> None:
    db = assessment_db()
    lini1_types = {t["id"] for t in db["position_types"] if t["line"] == 1}
    lini1 = [p for p in db["positions"] if p["position_type_id"] in lini1_types]
    for q in (x for x in db["quarters"] if x["fiscal_year"] == fy.year):
        expected = board_rules.expected_lini3(db, q["id"])
        for p in lini1:
            for _, rq in rules.quarter_risks(db, p["id"], q):
                for assessor in [p["id"], *expected]:
                    x = next(
                        (
                            a
                            for a in db["assessments"]
                            if a["risk_quarter_id"] == rq["id"]
                            and a["assessor_position_id"] == assessor
                        ),
                        None,
                    )
                    if x is not None and x["status"] in ("final", "not_assessed"):
                        continue
                    if x is not None:
                        Assessment.objects.filter(pk=x["id"]).update(
                            status="not_assessed", updated_at=at
                        )
                    else:
                        Assessment.objects.create(
                            risk_quarter_id=rq["id"],
                            assessor_position_id=assessor,
                            assessor_line=1 if assessor == p["id"] else 3,
                            status="not_assessed",
                            score_band_version_id=q["score_band_version_id"],
                            updated_at=at,
                        )
                if rq["comparison_status"] == "partial":
                    RiskQuarter.objects.filter(pk=rq["id"]).update(comparison_status="open")
    ComparisonResult.objects.filter(
        risk_quarter__quarter__fiscal_year_id=fy.year, explanation_required=True
    ).exclude(explanation_status="sent").update(explanation_status="not_sent")
