"""Risk proposals (FR-MST-005): custom risks offered as templates when a register is published.
Ports rejectProposal and saveTemplate(…, fromProposalId) in frontend/src/data/api/master.ts."""

import uuid
from typing import Any

from django.db import transaction

from simario.audit.services import record_by
from simario.core.errors import ApiError
from simario.core.permissions import Actor
from simario.notifications.services import notify

from .models import RiskProposal
from .services import save_template


def list_proposals(status: str | None) -> list[dict[str, Any]]:
    """Rows for /master/usulan with the source risk's context."""
    qs = RiskProposal.objects.select_related(
        "proposer",
        "source_register_risk__stage",
        "source_register_risk__register__position__position_type",
    ).order_by("-created_at")
    if status:
        qs = qs.filter(status=status)
    rows = []
    for p in qs:
        risk = p.source_register_risk
        position = risk.register.position
        rows.append(
            {
                "id": p.id,
                "source_register_risk_id": risk.id,
                "description": p.description,
                "proposer_user_id": p.proposer_id,
                "proposer_name": p.proposer.full_name,
                "status": p.status,
                "rejection_reason": p.rejection_reason,
                "created_at": p.created_at,
                "position_id": position.id,
                "position_name": position.name,
                "position_type_id": position.position_type_id,
                "position_type_name": position.position_type.name,
                "stage_id": risk.stage_id,
                "stage_name": risk.stage.name,
                "risk_type": risk.risk_type,
                "mitigations": [m.description_snapshot for m in risk.mitigations.order_by("order")],
            }
        )
    return rows


def _pending(proposal_id: uuid.UUID) -> RiskProposal:
    p = RiskProposal.objects.select_for_update().get(pk=proposal_id)
    if p.status != "pending":
        raise ApiError("nothing", "Usulan ini sudah diproses.")
    return p


@transaction.atomic
def reject_proposal(actor: Actor, proposal_id: uuid.UUID, reason: str) -> None:
    if not reason.strip():
        raise ApiError("validation", "Alasan penolakan wajib diisi.")
    p = _pending(proposal_id)
    p.status = "rejected"
    p.rejection_reason = reason.strip()
    p.save(update_fields=["status", "rejection_reason"])
    record_by(
        actor,
        "tolak_usulan",
        "RiskProposal",
        p.id,
        {"status": "pending"},
        {"status": "rejected", "reason": reason.strip()},
    )
    notify(
        user=p.proposer,
        kind="proposal_rejected",
        text=f"Usulan risiko “{p.description}” ditolak: {reason.strip()}",
        target_url="/",
        event_key=f"proposal-rejected:{p.id}",
        at=actor.at,
    )


@transaction.atomic
def accept_proposal(actor: Actor, proposal_id: uuid.UUID, data: dict[str, Any]) -> uuid.UUID:
    """Jadikan Template: the template is saved, the proposal accepted, the proposer notified."""
    p = _pending(proposal_id)
    template_id = save_template(actor, data)
    p.status = "accepted"
    p.save(update_fields=["status"])
    record_by(
        actor,
        "terima_usulan",
        "RiskProposal",
        p.id,
        {"status": "pending"},
        {"status": "accepted", "templateId": str(template_id)},
    )
    notify(
        user=p.proposer,
        kind="proposal_accepted",
        text=f"Usulan risiko “{p.description}” dijadikan template",
        target_url="/",
        event_key=f"proposal-accepted:{p.id}",
        at=actor.at,
    )
    return template_id
