import AppKit

@MainActor
enum OverlayPanelFactory {
  static func make(
    contentRect: NSRect,
    on screen: NSScreen,
    policy: OverlayWindowPolicy = .movablePresentation
  ) -> NSPanel {
    let panel = NSPanel(
      contentRect: contentRect,
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    policy.apply(to: panel)
    return panel
  }
}
