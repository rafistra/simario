"""Indonesian display formats for server-built copy; mirrors frontend/src/lib/format.ts."""

import datetime as dt

MONTHS_SHORT = ("Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des")


def format_date(day: dt.date) -> str:
    """6 Apr 2027."""
    return f"{day.day} {MONTHS_SHORT[day.month - 1]} {day.year}"
