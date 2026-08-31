import AppKit
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

@Test
func expandedTimerFrameKeepsTheCompactHoverAreaInsideIt() {
  let screen = CGRect(x: 0, y: 0, width: 1_512, height: 982)
  let compact = CGRect(
    x: screen.midX - PresentationTimerWindowMetrics.compactSize.width / 2,
    y: screen.maxY - PresentationTimerWindowMetrics.compactSize.height - 20,
    width: PresentationTimerWindowMetrics.compactSize.width,
    height: PresentationTimerWindowMetrics.compactSize.height
  )

  let expanded = PresentationTimerWindowMetrics.resizedFrame(
    from: compact,
    to: PresentationTimerWindowMetrics.expandedSize,
    within: screen
  )

  #expect(expanded.contains(compact))
}

@Test
func timerWindowLeavesRoomForTheWarningGlow() {
  #expect(
    PresentationTimerWindowMetrics.effectInset
      > PresentationTimerWindowMetrics.maximumGlowRadius
  )
}
