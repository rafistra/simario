from simario.board.models import Attachment, Comment
from simario.core import clock
from tests.demo import client_for, uid

BOARD = f"/api/v1/positions/{uid('pos-ppk-a1')}/board/2027"


def _thread(persona: str, risk: str) -> dict:  # type: ignore[type-arg]
    res = client_for(persona).get(f"/api/v1/register-risks/{uid(risk)}/thread")
    assert res.status_code == 200, res.json()
    return res.json()  # type: ignore[no-any-return]


def _risk_with_confidential() -> str:
    att = Attachment.objects.filter(is_confidential=True, owner_kind="comment").first()
    assert att is not None
    return str(Comment.objects.get(pk=att.owner_id).register_risk_id)


def test_board_groups_published_risks(demo: None) -> None:
    res = client_for("usr-andi").get(BOARD)
    assert res.status_code == 200
    body = res.json()
    assert body["published"] is True and body["total"] > 0
    row = (
        body["groups"][0]["types"][0]["rows"][0] if body["groups"][0]["types"][0]["rows"] else None
    )
    rows = [r for g in body["groups"] for t in g["types"] for r in t["rows"]]
    assert rows and {"risk", "counts", "markers", "opened", "unseen"} <= set(rows[0])
    assert row is None or row["risk"]["status"] in ("active", "inactive")
    assert client_for("usr-bambang").get(BOARD).status_code == 403


def test_confidential_hidden_without_permission_10(demo: None) -> None:
    risk_id = _risk_with_confidential()
    res = client_for("usr-andi").get(f"/api/v1/register-risks/{risk_id}/thread")
    body = res.json()
    comments = [c for g in body["timeline"] for c in g["comments"]] + [
        c for m in body["mitigations"] for g in m["quarters"] for c in g["comments"]
    ]
    files = [a["attachment"] for c in comments for a in c["attachments"]]
    assert not any(f["isConfidential"] for f in files)
    assert sum(c["confidentialHidden"] for c in comments) >= 1
    hendra = client_for("usr-hendra").get(f"/api/v1/register-risks/{risk_id}/thread").json()
    h_comments = [c for g in hendra["timeline"] for c in g["comments"]] + [
        c for m in hendra["mitigations"] for g in m["quarters"] for c in g["comments"]
    ]
    assert any(a["attachment"]["isConfidential"] for c in h_comments for a in c["attachments"])


def test_late_directorate_sees_no_panel(demo: None) -> None:
    """VIS-9 before the TW I results opened: Maya sees no other assessment."""
    clock.set_now(clock.parse_local("2027-03-20T09:00"))
    body = _thread("usr-maya", "rr-a1-penyerapan")
    for card in body["panel"]:
        others = [c for c in card["visible"] if not c["own"]]
        assert all(c["status"] in ("final", "not_assessed") for c in others)


def test_thread_since(demo: None) -> None:
    risk = Comment.objects.order_by("created_at").first()
    assert risk is not None
    url = f"/api/v1/register-risks/{risk.register_risk_id}/thread"
    none = client_for("usr-andi").get(url, {"since": "2099-01-01T00:00"}).json()
    assert none == {"comments": 0, "commentIds": []}
    some = client_for("usr-admin").get(url, {"since": "2000-01-01T00:00"}).json()
    assert some["comments"] >= 1


def test_participants_for_mentions(demo: None) -> None:
    res = client_for("usr-andi").get(
        f"/api/v1/register-risks/{uid('rr-a1-penyerapan')}/participants",
        {"quarterId": uid("q-2027-2")},
    )
    assert res.status_code == 200
    names = [p["name"] for p in res.json()]
    assert "Andi Wirawan" not in names and "Rafi Ananda" in names


def test_reader_is_not_participant(demo: None) -> None:
    body = _thread("usr-dewi", "rr-a1-penyerapan")
    assert body["participation"] is None and body["viewerIsHolder"] is False
