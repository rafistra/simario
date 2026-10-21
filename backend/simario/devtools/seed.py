"""Demo data for local development (spec §4.6): the prototype seed exported by
`npm run seed:export` (fixtures/demo.json), loaded with prototype ids turned into
deterministic UUIDs so demo links, the frontend id bridge and test vectors stay stable."""

import datetime as dt
import json
import re
import uuid
from functools import lru_cache
from pathlib import Path
from typing import Any

from django.apps import apps
from django.contrib.auth.hashers import make_password
from django.db import connection, transaction

from simario.core import clock

DEMO_PATH = Path(__file__).resolve().parent / "fixtures" / "demo.json"

NAMESPACE_SIMARIO = uuid.uuid5(uuid.NAMESPACE_DNS, "simario.ikn.go.id")
DEFAULT_NOW = "2027-04-06T09:00"

# B1 collections in load order (foreign keys first). Later stages append theirs.
COLLECTIONS = [
    "orgUnits",
    "roles",
    "positionTypes",
    "positions",
    "users",
    "occupancies",
    "delegates",
    "rolePermissions",
    "userRoles",
    "scoreBandVersions",
    "scoreBands",
    "scoreOptions",
    "fiscalYears",
    "quarters",
    "quarterAssessors",
    "assignments",
    "stages",
    "dataUmumForms",
    "riskTemplates",
    "mitigationTemplates",
    "registers",
    "declarations",
    "risks",
    "mitigations",
    "proposals",
    "riskQuarters",
    "assessments",
    "results",
    "comments",
    "attachments",
    "subscriptions",
    "threadViews",
    "notifications",
    "audit",
]

MODELS = {
    "orgUnits": "org.OrgUnit",
    "roles": "org.Role",
    "positionTypes": "org.PositionType",
    "positions": "org.Position",
    "users": "accounts.User",
    "occupancies": "org.PositionOccupancy",
    "delegates": "org.PositionDelegate",
    "rolePermissions": "org.RolePermission",
    "userRoles": "org.UserRole",
    "scoreBandVersions": "reference.ScoreBandVersion",
    "scoreBands": "reference.ScoreBand",
    "scoreOptions": "reference.ScoreOption",
    "fiscalYears": "calendar.FiscalYear",
    "quarters": "calendar.Quarter",
    "quarterAssessors": "calendar.QuarterAssessor",
    "assignments": "org.MonitoringAssignment",
    "stages": "reference.Stage",
    "dataUmumForms": "reference.DataUmumForm",
    "riskTemplates": "reference.RiskTemplate",
    "mitigationTemplates": "reference.MitigationTemplate",
    "registers": "registers.Register",
    "declarations": "registers.RegisterStageDeclaration",
    "risks": "registers.RegisterRisk",
    "mitigations": "registers.RegisterMitigation",
    "proposals": "reference.RiskProposal",
    "riskQuarters": "assessments.RiskQuarter",
    "assessments": "assessments.Assessment",
    "results": "assessments.ComparisonResult",
    "comments": "board.Comment",
    "attachments": "board.Attachment",
    "subscriptions": "board.ThreadSubscription",
    "threadViews": "board.ThreadView",
    "notifications": "notifications.Notification",
    "audit": "audit.AuditLog",
}

# Prototype field → model field, where the generic camelCase → snake_case rule is not enough.
RENAMES: dict[str, dict[str, str]] = {
    "users": {"active": "is_active"},
    "occupancies": {"decree_file": "decree_object_key"},
    "delegates": {
        "appointed_by_occupancy_id": "appointed_by_id",
        "letter_file": "letter_object_key",
    },
    "rolePermissions": {"permission": "permission_id"},
    "quarters": {"fiscal_year": "fiscal_year_id"},
    "quarterAssessors": {"excluded_by_user_id": "excluded_by_id"},
    "scoreBands": {"version_id": "version_id"},
    "audit": {"actor_user_id": "actor_id"},
    "registers": {
        "fiscal_year": "fiscal_year_id",
        "copied_from_register_id": "copied_from_id",
        "published_by_user_id": "published_by_id",
        "updated_by_user_id": "updated_by_id",
        "ready_by_user_id": "ready_by_id",
    },
    "risks": {"created_by_user_id": "created_by_id"},
    "mitigations": {"created_by_user_id": "created_by_id"},
    "proposals": {"proposer_user_id": "proposer_id"},
    "assessments": {"finalised_by_user_id": "finalised_by_id"},
    "results": {"explanation_sent_by_user_id": "explanation_sent_by_id"},
    "comments": {"author_user_id": "author_id", "withdrawn_by_user_id": "withdrawn_by_id"},
    "attachments": {"size_bytes": "size"},
}

DATETIME_FIELDS = {
    "archived_at",
    "deactivated_at",
    "read_at",
    "created_at",
    "at",
    "published_at",
    "updated_at",
    "ready_at",
    "first_opened_at",
    "opened_at",
    "explanation_sent_at",
    "finalised_at",
    "edited_at",
    "withdrawn_at",
    "uploaded_at",
    "last_seen_at",
}
DATE_ONLY = {"dataUmumForms": {"created_at"}}

_CAMEL = re.compile(r"(?<!^)(?=[A-Z])")
_LOCAL_DATETIME = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$")


def legacy_uuid(prototype_id: str) -> uuid.UUID:
    return uuid.uuid5(NAMESPACE_SIMARIO, prototype_id)


def snake(name: str) -> str:
    return _CAMEL.sub("_", name).lower()


@lru_cache(maxsize=4)
def _id_pattern(known: frozenset[str]) -> re.Pattern[str]:
    """Known ids as whole tokens: after start or / ? # & = - (fragments such as
    "komentar-cm-9"), before end or / ? # &. Longest first so "rr-a1-x" wins over "a1-x"."""
    ids = "|".join(re.escape(k) for k in sorted(known, key=len, reverse=True))
    return re.compile(rf"(?:^|(?<=[/?#&=-]))({ids})(?=$|[/?#&])")


def to_uuids(value: Any, known: set[str]) -> Any:
    """Known prototype ids → UUID strings, also inside strings such as target URLs."""
    if isinstance(value, dict):
        return {k: to_uuids(v, known) for k, v in value.items()}
    if isinstance(value, list):
        return [to_uuids(v, known) for v in value]
    if isinstance(value, str) and known:
        return _id_pattern(frozenset(known)).sub(lambda m: str(legacy_uuid(m.group(1))), value)
    return value


def load_raw() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(DEMO_PATH.read_text(encoding="utf-8"))
    return data


def known_ids(db: dict[str, list[dict[str, Any]]]) -> set[str]:
    return {r["id"] for rows in db.values() for r in rows if isinstance(r.get("id"), str)}


def convert_row(collection: str, row: dict[str, Any], known: set[str]) -> dict[str, Any]:
    renames = RENAMES.get(collection, {})
    out: dict[str, Any] = {}
    for key, value in row.items():
        field = snake(key)
        field = renames.get(field, field)
        if field == "id":
            out["id"] = legacy_uuid(value) if isinstance(value, str) else value
            continue
        if field.endswith("_id") and isinstance(value, str) and value in known:
            out[field] = legacy_uuid(value)
            continue
        if (
            field in DATETIME_FIELDS
            and field not in DATE_ONLY.get(collection, set())
            and isinstance(value, str)
            and _LOCAL_DATETIME.match(value)
        ):
            out[field] = clock.parse_local(value)
            continue
        out[field] = to_uuids(value, known) if collection in ("notifications", "audit") else value
    return out


def _truncate() -> None:
    labels = {
        "accounts",
        "org",
        "calendar",
        "reference",
        "audit",
        "notifications",
        "devtools",
        "imports",
        "registers",
        "assessments",
        "board",
    }
    tables = [m._meta.db_table for m in apps.get_models() if m._meta.app_label in labels]
    tables.append("django_session")
    with connection.cursor() as cursor:
        # Deferred FK checks from earlier writes in the same transaction block TRUNCATE.
        cursor.execute("SET CONSTRAINTS ALL IMMEDIATE")
        cursor.execute(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE")
        cursor.execute("SET CONSTRAINTS ALL DEFERRED")


def _create(collection: str, rows: list[dict[str, Any]], known: set[str]) -> int:
    model = apps.get_model(MODELS[collection])
    objects = []
    supports: list[Any] = []
    support_model = apps.get_model("org.MonitoringSupport")
    mention_model = apps.get_model("board.Mention")
    mentions: list[Any] = []
    for raw in rows:
        row = convert_row(collection, raw, known)
        for uid in row.pop("mention_user_ids", None) or []:
            mentions.append(mention_model(comment_id=row["id"], user_id=legacy_uuid(uid)))
        row.pop("blob_key", None)
        if collection == "users":
            row["password"] = make_password(row.pop("password", None))
        if collection == "registers":
            # Data Umum keys are fields (snake_case); `extra` keys are form field keys (data).
            row["data_umum"] = {snake(k): v for k, v in row["data_umum"].items()}
        if collection == "stages":
            row["code"] = raw["id"].removeprefix("stg-")
        for s in row.pop("supports", None) or []:
            supports.append(
                support_model(
                    assignment_id=row["id"],
                    position_id=legacy_uuid(s["positionId"]),
                    domain=s["domain"],
                )
            )
        objects.append(model(**row))
    model.objects.bulk_create(objects)
    support_model.objects.bulk_create(supports)
    mention_model.objects.bulk_create(mentions)
    return len(objects)


def as_of(db: dict[str, list[dict[str, Any]]], cutoff: str) -> dict[str, list[dict[str, Any]]]:
    """The demo data as it stood at `cutoff` (local "YYYY-MM-DDTHH:MM"); ports
    frontend/src/data/seed/asOf.ts. Everything timestamped later is removed or rolled back."""

    def after(t: Any) -> bool:
        return isinstance(t, str) and t > cutoff

    day = cutoff[:10]
    comments = [
        {
            **c,
            "editedAt": None if after(c.get("editedAt")) else c.get("editedAt"),
            "withdrawnAt": None if after(c.get("withdrawnAt")) else c.get("withdrawnAt"),
            "withdrawnByUserId": None
            if after(c.get("withdrawnAt"))
            else c.get("withdrawnByUserId"),
        }
        for c in db["comments"]
        if not after(c["createdAt"])
    ]
    comment_ids = {c["id"] for c in comments}
    # An assessment finalised after the cutoff had not been started yet (no draft history).
    assessments = [
        a
        for a in db["assessments"]
        if not after(a.get("finalisedAt")) and not after(a["updatedAt"])
    ]
    assessment_ids = {a["id"] for a in assessments}
    results = []
    for r in db["results"]:
        if after(r["openedAt"]):
            continue
        if after(r.get("explanationSentAt")):
            r = {
                **r,
                "explanationStatus": "pending" if r["explanationRequired"] else "optional",
                "explanationReason": None,
                "explanationPlan": None,
                "explanationSentAt": None,
                "explanationSentByUserId": None,
                "explanationLateness": None,
            }
        results.append(r)
    quarters = [
        {**q, "scoreBandVersionId": None} if min(q["lini3OpensOn"], q["lini1OpensOn"]) > day else q
        for q in db["quarters"]
    ]
    started = {q["id"] for q in quarters if q["startsOn"] <= day}
    risk_quarters = []
    for rq in db["riskQuarters"]:
        if rq["quarterId"] not in started:
            continue
        opened = [r for r in results if r["riskQuarterId"] == rq["id"]]
        expected = len(
            [
                a
                for a in db["quarterAssessors"]
                if a["quarterId"] == rq["quarterId"] and not a["excluded"]
            ]
        )
        risk_quarters.append(
            {
                **rq,
                "comparisonStatus": "waiting"
                if not opened
                else ("open" if len(opened) >= expected else "partial"),
                "firstOpenedAt": min(r["openedAt"] for r in opened) if opened else None,
                "recurring": rq["recurring"] if opened else False,
            }
        )
    risks = [
        {
            **r,
            "status": "active",
            "deactivatedAt": None,
            "deactivatedFromQuarterId": None,
            "deactivationReason": None,
        }
        if after(r.get("deactivatedAt"))
        else r
        for r in db["risks"]
    ]
    attachments = [
        a
        for a in db["attachments"]
        if not after(a["uploadedAt"])
        and (
            a["ownerId"] in comment_ids
            if a["ownerKind"] == "comment"
            else a["ownerId"] in assessment_ids
        )
    ]
    fiscal_years = [
        {**f, "status": "open", "archivedAt": None, "archivedBy": None}
        if after(f.get("archivedAt"))
        else f
        for f in db["fiscalYears"]
    ]
    return {
        **db,
        "quarters": quarters,
        "comments": comments,
        "attachments": attachments,
        "assessments": assessments,
        "results": results,
        "riskQuarters": risk_quarters,
        "risks": risks,
        "notifications": [n for n in db["notifications"] if not after(n["createdAt"])],
        "audit": [a for a in db["audit"] if not after(a["at"])],
        "threadViews": [v for v in db["threadViews"] if not after(v["lastSeenAt"])],
        "proposals": [x for x in db["proposals"] if not after(x["createdAt"])],
        "fiscalYears": fiscal_years,
    }


@transaction.atomic
def load_demo(at: dt.datetime | None = None) -> dict[str, int]:
    """Replaces all app data with the demo export; returns rows per collection."""
    data = load_raw()
    db = data["db"]
    known = known_ids(db)
    _truncate()
    counts: dict[str, int] = {}
    permission = apps.get_model("org.Permission")
    for p in data["permissions"]:
        permission.objects.create(**{snake(k): v for k, v in p.items()})
    counts["permissions"] = len(data["permissions"])
    if at is not None:
        db = as_of(db, at.strftime("%Y-%m-%dT%H:%M"))
    for collection in COLLECTIONS:
        counts[collection] = _create(collection, db[collection], known)
    clock.set_now(at or clock.parse_local(DEFAULT_NOW))
    return counts
