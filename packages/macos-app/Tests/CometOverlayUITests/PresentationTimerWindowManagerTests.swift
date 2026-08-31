import CometOverlayCore
import Testing

@testable import CometOverlayUI

@Test
func presentationTimerWindowExpandsOnlyForHoverOrExpiration() {
  let normal = PresentationTimerSnapshot(
    status: .running,
    remainingSeconds: 600,
    attention: .normal
  )
  let expired = PresentationTimerSnapshot(
    status: .running,
    remainingSeconds: 0,
    attention: .expired
  )

  let compactSize = PresentationTimerWindowMetrics.size(for: normal, isHovered: false)
  let hoverSize = PresentationTimerWindowMetrics.size(for: normal, isHovered: true)
  let expiredSize = PresentationTimerWindowMetrics.size(for: expired, isHovered: false)

  #expect(compactSize.width < expiredSize.width)
  #expect(compactSize.height < expiredSize.height)
  #expect(expiredSize.width < hoverSize.width)
  #expect(expiredSize.height < hoverSize.height)
  #expect(
    PresentationTimerWindowMetrics.size(for: expired, isHovered: true) == hoverSize
  )
}
