import AppKit
import Testing

@testable import CometOverlayUI

@Test
func presentationWindowPolicySupportsFullscreenWithoutBlockingInput() {
  let policy = OverlayWindowPolicy.presentation

  #expect(policy.level.rawValue > NSWindow.Level.normal.rawValue)
  #expect(policy.collectionBehavior.contains(.canJoinAllSpaces))
  #expect(policy.collectionBehavior.contains(.fullScreenAuxiliary))
  #expect(policy.collectionBehavior.contains(.stationary))
  #expect(policy.collectionBehavior.contains(.ignoresCycle))
  #expect(policy.ignoresMouseEvents)
  #expect(!policy.isOpaque)
  #expect(!policy.hasShadow)
  #expect(!policy.hidesOnDeactivate)
}
