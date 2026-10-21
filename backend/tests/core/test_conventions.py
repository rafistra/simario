import pytest
from rest_framework.test import APIClient

pytestmark = pytest.mark.urls("tests.core.urls_testonly")


def test_response_is_camel_case(client: APIClient) -> None:
    assert client.get("/api/v1/echo").json() == {"fiscalYear": 2027}


def test_request_body_is_snake_cased(client: APIClient) -> None:
    res = client.post("/api/v1/echo", {"fiscalYear": 2027}, format="json")
    assert res.json() == {"receivedFiscalYear": 2027}


def test_page_pagination_shape(client: APIClient) -> None:
    body = client.get("/api/v1/items?page=2").json()
    assert body == {"results": list(range(25, 30)), "page": 2, "pageSize": 25, "total": 30}
