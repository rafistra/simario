import json
import re
from typing import Any

import pytest
from django.core.management import CommandError, call_command

from simario.accounts.models import User
from simario.audit.models import AuditLog
from simario.core import clock
from simario.devtools.seed import COLLECTIONS, DEMO_PATH, legacy_uuid, load_demo
from simario.notifications.models import Notification

pytestmark = pytest.mark.django_db

DEMO = json.loads(DEMO_PATH.read_text(encoding="utf-8"))


def test_seed_demo_counts_match_export() -> None:
    counts = load_demo()
    for name in COLLECTIONS:
        assert counts[name] == len(DEMO["db"][name]), name
    assert counts["permissions"] == 26


def test_seed_demo_twice_is_identical() -> None:
    first = load_demo()
    second = load_demo()
    assert first == second


def test_seed_demo_ids_are_legacy_uuids() -> None:
    load_demo()
    andi = User.objects.get(nip="198204172008011003")
    assert andi.id == legacy_uuid("usr-andi")
    assert andi.full_name == "Andi Wirawan"


def test_local_account_passwords_are_hashed() -> None:
    load_demo()
    admin = User.objects.get(full_name="Admin DKB")
    assert admin.check_password("Simario-Admin-2027!")
    assert admin.password != "Simario-Admin-2027!"


def test_notification_target_url_uses_uuids() -> None:
    load_demo()
    urls = list(Notification.objects.values_list("target_url", flat=True))
    assert urls
    assert not any("pos-ppk-a1" in u for u in urls)
    assert any(str(legacy_uuid("pos-ppk-a1")) in u for u in urls)


def test_seed_demo_sets_default_clock() -> None:
    load_demo()
    assert clock.now().strftime("%Y-%m-%d") == "2027-04-06"


def test_seed_demo_as_of_drops_later_rows() -> None:
    cutoff = "2027-03-18T09:00"
    load_demo(clock.parse_local(cutoff))

    def later(rows: list[dict[str, Any]], key: str) -> int:
        return sum(1 for r in rows if r[key] > cutoff)

    assert later(DEMO["db"]["notifications"], "createdAt") > 0
    assert Notification.objects.count() == len(DEMO["db"]["notifications"]) - later(
        DEMO["db"]["notifications"], "createdAt"
    )
    assert AuditLog.objects.count() == len(DEMO["db"]["audit"]) - later(DEMO["db"]["audit"], "at")
    assert clock.now().strftime("%Y-%m-%dT%H") == "2027-03-18T09"


def test_seed_demo_refused_without_dev_tools(settings: Any) -> None:
    settings.SIMARIO_DEV_TOOLS = False
    with pytest.raises(CommandError, match="SIMARIO_DEV_TOOLS"):
        call_command("seed_demo")


def test_seed_demo_command_loads_data() -> None:
    call_command("seed_demo")
    assert User.objects.filter(nip="198204172008011003").exists()


def test_target_urls_have_no_prototype_ids_even_in_fragments() -> None:
    from simario.devtools.seed import known_ids, load_raw

    load_demo()
    known = known_ids(load_raw()["db"])
    for url in Notification.objects.values_list("target_url", flat=True):
        for token in re.split(r"[/?#&=]", url):
            assert token not in known, url
            assert not any(token.endswith(f"-{k}") for k in known), url
