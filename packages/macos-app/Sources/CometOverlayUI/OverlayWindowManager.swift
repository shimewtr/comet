import AppKit
import CometOverlayCore
import SwiftUI

@MainActor
public final class OverlayWindowManager: NSObject, OverlayPresenting {
  private struct ScreenOverlay {
    let window: NSPanel
    let model: OverlaySceneModel
  }

  private var overlays: [CGDirectDisplayID: ScreenOverlay] = [:]
  private var isEnabled = true

  public override init() {
    super.init()
    refreshScreens()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(screenParametersDidChange),
      name: NSApplication.didChangeScreenParametersNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  public func setEnabled(_ enabled: Bool) {
    isEnabled = enabled
    for overlay in overlays.values {
      if enabled {
        overlay.window.orderFrontRegardless()
      } else {
        overlay.window.orderOut(nil)
        overlay.model.removeAll()
      }
    }
  }

  public func show(comment: CometComment, placement: CommentPlacement = .scrolling) {
    guard isEnabled else { return }
    for overlay in overlays.values {
      overlay.model.show(comment: comment, placement: placement)
    }
  }

  public func show(stamp: StampMessage) {
    guard isEnabled else { return }
    for overlay in overlays.values {
      overlay.model.show(stamp: stamp)
    }
  }

  @objc private func screenParametersDidChange() {
    refreshScreens()
  }

  private func refreshScreens() {
    let currentScreens = Dictionary(
      uniqueKeysWithValues: NSScreen.screens.map { (displayID(for: $0), $0) }
    )
    let removedDisplayIDs = overlays.keys.filter { currentScreens[$0] == nil }

    for displayID in removedDisplayIDs {
      overlays.removeValue(forKey: displayID)?.window.orderOut(nil)
    }

    for (displayID, screen) in currentScreens {
      if let overlay = overlays[displayID] {
        overlay.window.setFrame(screen.frame, display: true)
      } else {
        overlays[displayID] = makeOverlay(for: screen)
      }
    }
  }

  private func makeOverlay(for screen: NSScreen) -> ScreenOverlay {
    let model = OverlaySceneModel()
    let window = NSPanel(
      contentRect: screen.frame,
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    window.backgroundColor = .clear
    window.isOpaque = false
    window.hasShadow = false
    window.ignoresMouseEvents = true
    window.acceptsMouseMovedEvents = false
    window.hidesOnDeactivate = false
    window.level = .floating
    window.collectionBehavior = [
      .canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle,
    ]
    window.contentView = NSHostingView(rootView: OverlayCanvasView(model: model))
    if isEnabled {
      window.orderFrontRegardless()
    }
    return ScreenOverlay(window: window, model: model)
  }

  private func displayID(for screen: NSScreen) -> CGDirectDisplayID {
    (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
      ?? 0
  }
}
