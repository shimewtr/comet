import CometOverlayCore
import Testing

@testable import CometOverlayUI

@Test
func bounceEffectMovesUpAndReturnsToItsBaseline() {
  #expect(CommentEffectMotion.verticalOffset(for: .bounce, at: 0) == 0)
  #expect(CommentEffectMotion.verticalOffset(for: .bounce, at: 0.6) == -20)
  #expect(abs(CommentEffectMotion.verticalOffset(for: .bounce, at: 1.2)) < 0.001)
}

@Test
func shakeEffectAlternatesAboveAndBelowItsBaseline() {
  #expect(CommentEffectMotion.verticalOffset(for: .shake, at: 0.04) == 6)
  #expect(CommentEffectMotion.verticalOffset(for: .shake, at: 0.12) == -6)
}

@Test
func otherCommentEffectsDoNotChangeVerticalPosition() {
  #expect(CommentEffectMotion.verticalOffset(for: CommentAnimation.none, at: 0.1) == 0)
  #expect(CommentEffectMotion.verticalOffset(for: .blink, at: 0.1) == 0)
  #expect(CommentEffectMotion.verticalOffset(for: nil, at: 0.1) == 0)
}
