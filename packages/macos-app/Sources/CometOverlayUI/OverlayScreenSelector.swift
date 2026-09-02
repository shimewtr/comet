import AppKit

enum OverlayScreenSelector {
  static func screens(selectedDisplayID: String?) -> [NSScreen] {
    guard let selectedDisplayID else { return NSScreen.screens }
    if let screen = NSScreen.screens.first(where: {
      ScreenIdentity.stableDisplayID(for: $0) == selectedDisplayID
    }) {
      return [screen]
    }
    return NSScreen.main.map { [$0] } ?? []
  }
}
