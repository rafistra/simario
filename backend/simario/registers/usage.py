"""How master data is used by registers — read by master-data checks (template "Dipakai N
jabatan", deleting used stages/templates, impact of deactivating a position). B2 shipped these
as stubs (U-21); B3 answers from the register models with the same signatures."""

import uuid

from django.db.models import Count, Q


def template_usage(template_id: uuid.UUID, fiscal_year: int) -> int:
    """Registers of `fiscal_year` that selected the template."""
    from .models import RegisterRisk

    return (
        RegisterRisk.objects.filter(
            risk_template_id=template_id, register__fiscal_year_id=fiscal_year
        )
        .values("register_id")
        .distinct()
        .count()
    )


def template_ever_used(template_id: uuid.UUID) -> bool:
    from .models import RegisterRisk

    return RegisterRisk.objects.filter(risk_template_id=template_id).exists()


def stage_used(stage_id: uuid.UUID) -> bool:
    from .models import RegisterRisk, RegisterStageDeclaration

    return (
        RegisterRisk.objects.filter(stage_id=stage_id).exists()
        or RegisterStageDeclaration.objects.filter(stage_id=stage_id).exists()
    )


def running_registers_of_positions(position_ids: list[uuid.UUID]) -> int:
    """Registers of these positions that are not archived."""
    from .models import Register

    return Register.objects.filter(position_id__in=position_ids).exclude(status="archived").count()


def published_registers(position_id: uuid.UUID) -> list[dict[str, int]]:
    """[{"fiscal_year", "active_risks"}] of the position's published registers."""
    from .models import Register

    rows = (
        Register.objects.filter(position_id=position_id, status="published")
        .annotate(active=Count("risks", filter=Q(risks__status="active")))
        .order_by("fiscal_year_id")
    )
    return [{"fiscal_year": r.fiscal_year_id, "active_risks": r.active} for r in rows]
