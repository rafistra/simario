"""How master data is used by registers — read by master-data checks (template "Dipakai N
jabatan", deleting used stages/templates, impact of deactivating a position).

B2: registers still live in the browser, so these answer "unused" (U-21 in
docs/04_risk_and_debt.md). B3 implements them over the register models with the same
signatures."""

import uuid


def template_usage(template_id: uuid.UUID, fiscal_year: int) -> int:
    """Registers of `fiscal_year` that selected the template."""
    return 0


def template_ever_used(template_id: uuid.UUID) -> bool:
    return False


def stage_used(stage_id: uuid.UUID) -> bool:
    return False


def running_registers_of_positions(position_ids: list[uuid.UUID]) -> int:
    """Registers of these positions that are not archived."""
    return 0


def published_registers(position_id: uuid.UUID) -> list[dict[str, int]]:
    """[{"fiscal_year", "active_risks"}] of the position's published registers."""
    return []
