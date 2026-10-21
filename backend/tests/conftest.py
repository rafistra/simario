import pytest
from rest_framework.test import APIClient


@pytest.fixture
def client() -> APIClient:
    return APIClient()


@pytest.fixture
def demo(db: None) -> None:
    """The prototype demo seed (simario/devtools/fixtures/demo.json)."""
    from simario.devtools.seed import load_demo

    load_demo()
