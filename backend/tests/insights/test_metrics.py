from typing import Any

import pytest

from simario.insights.metrics import build_metrics, metrics_csv
from tests.vectors import load_vectors

V = load_vectors("metrics")


@pytest.mark.parametrize("case", V["buildMetrics"], ids=lambda c: c["name"])
def test_metrics_match_prototype(case: dict[str, Any]) -> None:
    i = case["input"]
    assert build_metrics(i["db"], i["year"], i["at"]) == case["expected"]


def test_csv_quotes() -> None:
    cards = [
        {
            "objective": 1,
            "title": 'Risiko "pusat"',
            "unit": "percent",
            "points": [{"label": "TA 2027", "value": 0.8125, "numerator": 13, "denominator": 16}],
        },
        {"objective": 8, "title": "Waktu", "unit": "minutes", "points": []},
    ]
    assert metrics_csv(cards, 2027).split("\n") == [
        "tujuan,judul,periode,nilai,pembilang,penyebut",
        '1,"Risiko ""pusat""","TA 2027",81.3,13,16',  # (0.8125 * 100).toFixed(1)
        '8,"Waktu","TA 2027",,0,0',
    ]
