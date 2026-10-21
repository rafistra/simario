"""Loader for shared/test-vectors/*.json (spec §4.9)."""

import json
import re
from pathlib import Path
from typing import Any

VECTORS_DIR = Path(__file__).resolve().parents[2] / "shared" / "test-vectors"


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def _snake_keys(value: Any) -> Any:
    if isinstance(value, dict):
        return {_snake(k): _snake_keys(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_snake_keys(v) for v in value]
    return value


def load_vectors(name: str) -> dict[str, list[dict[str, Any]]]:
    """Cases per TS rule name; `input` keys in snake_case, fixture names resolved."""
    data = json.loads((VECTORS_DIR / f"{name}.json").read_text(encoding="utf-8"))
    fixtures: dict[str, Any] = _snake_keys(data.get("fixtures", {}))
    rules: dict[str, list[dict[str, Any]]] = {}
    for rule, cases in data["rules"].items():
        rules[rule] = [
            {
                **case,
                "input": {
                    k: fixtures[v] if isinstance(v, str) and v in fixtures else v
                    for k, v in _snake_keys(case["input"]).items()
                },
            }
            for case in cases
        ]
    return rules
