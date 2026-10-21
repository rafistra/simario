from simario.assessments.models import Assessment, ComparisonResult
from simario.board.models import Attachment, Comment, Mention, ThreadSubscription, ThreadView


def test_demo_board_loaded(demo: None) -> None:
    assert Comment.objects.count() == 20
    assert Attachment.objects.count() == 9
    assert ThreadSubscription.objects.count() == 8
    assert ThreadView.objects.count() == 4
    assert Assessment.objects.count() == 86
    assert ComparisonResult.objects.count() == 55
    assert Attachment.objects.filter(is_confidential=True).exists()
    assert Mention.objects.exists()
