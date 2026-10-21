from typing import Any

from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class PagePagination(PageNumberPagination):
    """`?page=n`, 25 rows (PRD §2.4). Body: {results, page, pageSize, total}."""

    page_size = 25

    def get_paginated_response(self, data: Any) -> Response:
        assert self.page is not None
        return Response(
            {
                "results": data,
                "page": self.page.number,
                "page_size": self.page.paginator.per_page,
                "total": self.page.paginator.count,
            }
        )

    def get_paginated_response_schema(self, schema: dict[str, Any]) -> dict[str, Any]:
        return {
            "type": "object",
            "required": ["results", "page", "pageSize", "total"],
            "properties": {
                "results": schema,
                "page": {"type": "integer"},
                "pageSize": {"type": "integer"},
                "total": {"type": "integer"},
            },
        }


class CommentPagination(PagePagination):
    """50 comments per page (PRD §2.4)."""

    page_size = 50
