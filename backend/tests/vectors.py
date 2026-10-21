"""Loader for shared/test-vectors/*.json (spec §4.9), mirrored by frontend/src/test/vectors.ts.
Keys become snake_case (inputs and expected values); a string input equal to a fixture name
becomes that fixture; "$demo" is the prototype seed, "$permissions" the permission catalogue,
"$quarters" the seed quarters."""

import json
import re
from functools import cache
from pathlib import Path
from typing import Any

REPO = Path(__file__).resolve().parents[2]
VECTORS_DIR = REPO / "shared" / "test-vectors"
DEMO_PATH = REPO / "backend" / "simario" / "devtools" / "fixtures" / "demo.json"


def _snake(name: str) -> str:
    return re.sub(r"(?<!^)(?=[A-Z])", "_", name).lower()


def snake_keys(value: Any) -> Any:
    if isinstance(value, dict):
        return {_snake(k): snake_keys(v) for k, v in value.items()}
    if isinstance(value, list):
        return [snake_keys(v) for v in value]
    return value


@cache
def _demo() -> dict[str, Any]:
    data: dict[str, Any] = snake_keys(json.loads(DEMO_PATH.read_text(encoding="utf-8")))
    return data


def _builtin(name: str) -> Any:
    if name == "$demo":
        return _demo()["db"]
    if name == "$permissions":
        return _demo()["permissions"]
    if name == "$quarters":
        return _demo()["db"]["quarters"]
    raise KeyError(name)


def load_vectors(name: str) -> dict[str, list[dict[str, Any]]]:
    """Cases per TS rule name, with snake_case keys and fixtures resolved."""
    data = json.loads((VECTORS_DIR / f"{name}.json").read_text(encoding="utf-8"))
    fixtures: dict[str, Any] = snake_keys(data.get("fixtures", {}))

    def resolve(value: Any) -> Any:
        if isinstance(value, str) and value.startswith("$"):
            return _builtin(value)
        if isinstance(value, str) and value in fixtures:
            return fixtures[value]
        return value

    return {
        rule: [
            {
                "name": case["name"],
                "input": {k: resolve(v) for k, v in snake_keys(case["input"]).items()},
                "expected": snake_keys(case["expected"]),
            }
            for case in cases
        ]
        for rule, cases in data["rules"].items()
    }
