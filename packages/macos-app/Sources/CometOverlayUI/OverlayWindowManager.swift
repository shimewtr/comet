import AppKit
import CometOverlayCore
import SwiftUI

extension Notification.Name {
  public static let cometOverlayDisplaysDidChange = Notification.Name(
    "comet.overlay.displays-did-change"
  )
}

@MainActor
public final class OverlayWindowManager: NSObject, OverlayPresenting {
  private struct ScreenOverlay {
    let window: NSPanel
    let model: OverlaySceneModel
    let descriptor: OverlayDisplayDescriptor
  }

  private var overlays: [CGDirectDisplayID: ScreenOverlay] = [:]
  private var configuration = OverlayPresentationConfiguration(
    isEnabled: true,
    selectedDisplayID: nil,
    displaySettings: OverlayDisplaySettings()
  )

  public var availableDisplays: [OverlayDisplayDescriptor] {
    overlays.values.map(\.descriptor).sorted {
      $0.name.localizedCompare($1.name) == .orderedAscending
    }
  }

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

  public func apply(configuration: OverlayPresentationConfiguration) {
    self.configuration = configuration
    applyConfigurationToWindows(clearWhenDisabled: true)
  }

  public func show(comment: CometComment, placement: CommentPlacement = .scrolling) {
    guard configuration.isEnabled else { return }
    for (displayID, overlay) in overlays where shouldShowOverlay(on: displayID) {
      overlay.model.show(comment: comment, placement: placement)
    }
  }

  public func show(stamp: StampMessage) {
    guard configuration.isEnabled else { return }
    for (displayID, overlay) in overlays where shouldShowOverlay(on: displayID) {
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
    applyConfigurationToWindows(clearWhenDisabled: false)
    NotificationCenter.default.post(name: .cometOverlayDisplaysDidChange, object: self)
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
    OverlayWindowPolicy.presentation.apply(to: window)
    window.contentView = NSHostingView(rootView: OverlayCanvasView(model: model))
    return ScreenOverlay(
      window: window,
      model: model,
      descriptor: OverlayDisplayDescriptor(
        id: stableDisplayID(for: screen),
        name: screen.localizedName
      )
    )
  }

  private func applyConfigurationToWindows(clearWhenDisabled: Bool) {
    for (displayID, overlay) in overlays {
      overlay.model.displaySettings = configuration.displaySettings
      if shouldShowOverlay(on: displayID) {
        overlay.window.orderFrontRegardless()
      } else {
        overlay.window.orderOut(nil)
        if clearWhenDisabled {
          overlay.model.removeAll()
        }
      }
    }
  }

  private func shouldShowOverlay(on displayID: CGDirectDisplayID) -> Bool {
    guard configuration.isEnabled else { return false }
    guard let overlay = overlays[displayID] else { return false }
    let availableDisplayIDs = Set(overlays.values.map(\.descriptor.id))
    let mainDisplayID = NSScreen.main.map(stableDisplayID(for:))
    let visibleDisplayIDs = DisplaySelectionResolver.visibleDisplayIDs(
      selectedDisplayID: configuration.selectedDisplayID,
      availableDisplayIDs: availableDisplayIDs,
      mainDisplayID: mainDisplayID
    )
    return visibleDisplayIDs.contains(overlay.descriptor.id)
  }

  private func displayID(for screen: NSScreen) -> CGDirectDisplayID {
    (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
      ?? 0
  }

  private func stableDisplayID(for screen: NSScreen) -> String {
    let displayID = displayID(for: screen)
    guard let displayUUID = CGDisplayCreateUUIDFromDisplayID(displayID)?.takeRetainedValue()
    else {
      return "display-\(displayID)"
    }
    return CFUUIDCreateString(nil, displayUUID) as String
  }
}
