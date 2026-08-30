import AppKit
import Testing

@testable import CometOverlayUI

@Test
func presentationWindowPolicySupportsFullscreenWithoutBlockingInput() {
  let policy = OverlayWindowPolicy.presentation

  #expect(policy.level.rawValue > NSWindow.Level.normal.rawValue)
  #expect(policy.level == .screenSaver)
  #expect(policy.collectionBehavior.contains(.canJoinAllSpaces))
  #expect(policy.collectionBehavior.contains(.fullScreenAuxiliary))
  #expect(policy.collectionBehavior.contains(.transient))
  #expect(policy.collectionBehavior.contains(.canJoinAllApplications))
  #expect(!policy.collectionBehavior.contains(.stationary))
  #expect(policy.collectionBehavior.contains(.ignoresCycle))
  #expect(policy.ignoresMouseEvents)
  #expect(!policy.isOpaque)
  #expect(!policy.hasShadow)
  #expect(!policy.hidesOnDeactivate)
}

@MainActor
@Test
func presentationWindowPolicyKeepsOverlayOutOfWindowManagement() {
  let window = NSPanel(
    contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: false
  )

  OverlayWindowPolicy.presentation.apply(to: window)

  #expect(window.ignoresMouseEvents)
  #expect(!window.acceptsMouseMovedEvents)
  #expect(!window.isMovable)
  #expect(!window.isMovableByWindowBackground)
  #expect(window.isExcludedFromWindowsMenu)
}

@MainActor
@Test
func overlayPanelDoesNotShrinkFullscreenFrames() {
  let window = OverlayPanel(
    contentRect: NSRect(x: 0, y: 0, width: 800, height: 600),
    styleMask: [.borderless, .nonactivatingPanel],
    backing: .buffered,
    defer: false
  )
  let requestedFrame = NSRect(x: -980, y: 982, width: 3_440, height: 1_440)

  #expect(window.constrainFrameRect(requestedFrame, to: NSScreen.main) == requestedFrame)
  window.setFrame(requestedFrame, display: false)
  #expect(window.frame == requestedFrame)
}
