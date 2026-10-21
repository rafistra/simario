"""Quarterly assessment (PRD ch. 7, FR-NIL-001 … 012). Ports assessmentApi in
frontend/src/data/api/assessment.ts: drafting needs permission 4 (Lini 1) or 8 (Lini 3) on the
assessor position; finalising, reopening and sending need 5 / 9 as Pejabat (INV-12)."""

from typing import Any

from simario.accounts.models import User
from simario.audit.services import record
from simario.core import clock


def log_blind_view(user: User, position_id: Any, quarter_id: Any) -> None:
    """FR-NIL-012: every view of unopened assessments is audit-logged."""
    record(
        action="lihat_penilaian_sebelum_dibuka",
        entity_type="Quarter",
        entity_id=str(quarter_id),
        actor=user,
        acting_as="superadmin",
        after={"position": str(position_id)},
        at=clock.now(),
    )
