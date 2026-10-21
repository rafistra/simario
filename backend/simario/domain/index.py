"""Lookup indexes over a rules Db, so the rules stay linear when a read model runs them over
every position (final review B6). An index is cached inside the Db under "_idx" and rebuilt when
its collection is replaced or grows (services append rows to a Db while they work); rows changed
in place keep their keys, which are ids that never change."""

from collections import defaultdict
from typing import Any

Row = dict[str, Any]


def by(db: Any, collection: str, *keys: str) -> dict[tuple[Any, ...], list[Row]]:
    """Rows of `collection` grouped by the values of `keys`."""
    rows = db[collection]
    cache: dict[tuple[str, tuple[str, ...]], tuple[int, int, dict[tuple[Any, ...], list[Row]]]]
    cache = db.setdefault("_idx", {}) if isinstance(db, dict) else {}
    hit = cache.get((collection, keys))
    if hit is not None and hit[0] == id(rows) and hit[1] == len(rows):
        return hit[2]
    grouped: dict[tuple[Any, ...], list[Row]] = defaultdict(list)
    for r in rows:
        grouped[tuple(r.get(k) for k in keys)].append(r)
    cache[(collection, keys)] = (id(rows), len(rows), grouped)
    return grouped


def one(db: Any, collection: str, key: str, value: Any) -> Row | None:
    rows = by(db, collection, key).get((value,))
    return rows[0] if rows else None
