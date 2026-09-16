import CometOverlayCore
import Testing

@testable import CometOverlayUI

@Test
func bounceEffectAnticipatesJumpsAndSquashesOnLanding() {
  #expect(CommentEffectMotion.transform(for: .bounce, at: 0) == .identity)
  #expect(
    CommentEffectMotion.transform(for: .bounce, at: 0.14)
      == CommentEffectTransform(verticalOffset: 8, scaleX: 1.18, scaleY: 0.78)
  )
  #expect(
    CommentEffectMotion.transform(for: .bounce, at: 0.672)
      == CommentEffectTransform(verticalOffset: -72, scaleX: 0.94, scaleY: 1.08)
  )
  #expect(
    CommentEffectMotion.transform(for: .bounce, at: 1.036)
      == CommentEffectTransform(verticalOffset: 6, scaleX: 1.24, scaleY: 0.72)
  )
  #expect(CommentEffectMotion.transform(for: .bounce, at: 1.4) == .identity)
}

@Test
func shakeEffectAlternatesAboveAndBelowItsBaseline() {
  #expect(CommentEffectMotion.transform(for: .shake, at: 0.04).verticalOffset == 6)
  #expect(CommentEffectMotion.transform(for: .shake, at: 0.12).verticalOffset == -6)
}

@Test
func otherCommentEffectsDoNotChangeVerticalPosition() {
  #expect(CommentEffectMotion.transform(for: CommentAnimation.none, at: 0.1) == .identity)
  #expect(CommentEffectMotion.transform(for: .blink, at: 0.1) == .identity)
  #expect(CommentEffectMotion.transform(for: nil, at: 0.1) == .identity)
}
