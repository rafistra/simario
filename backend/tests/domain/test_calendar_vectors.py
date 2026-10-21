from typing import Any

import pytest

from simario.domain.calendar import quarter_containing
from tests.vectors import load_vectors

VECTORS = load_vectors("calendar")


@pytest.mark.parametrize("case", VECTORS["quarterContaining"], ids=lambda c: c["name"])
def test_quarter_containing(case: dict[str, Any]) -> None:
    q = quarter_containing(case["input"]["quarters"], case["input"]["day"])
    assert (q["id"] if q else None) == case["expected"]
