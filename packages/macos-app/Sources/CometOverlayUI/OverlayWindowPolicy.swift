import AppKit

public struct OverlayWindowPolicy: Sendable {
  public static let presentation = OverlayWindowPolicy(
    // floating levelはWindow Serverが大型panelを縮小するため、メニューバー直下を使う。
    level: NSWindow.Level(rawValue: NSWindow.Level.mainMenu.rawValue - 1),
    collectionBehavior: [
      .canJoinAllSpaces, .canJoinAllApplications, .fullScreenAuxiliary, .transient,
      .ignoresCycle,
    ],
    ignoresMouseEvents: true,
    isOpaque: false,
    hasShadow: false,
    hidesOnDeactivate: false
  )

  public let level: NSWindow.Level
  public let collectionBehavior: NSWindow.CollectionBehavior
  public let ignoresMouseEvents: Bool
  public let isOpaque: Bool
  public let hasShadow: Bool
  public let hidesOnDeactivate: Bool

  @MainActor
  public func apply(to window: NSWindow) {
    window.backgroundColor = .clear
    window.level = level
    window.collectionBehavior = collectionBehavior
    window.ignoresMouseEvents = ignoresMouseEvents
    window.acceptsMouseMovedEvents = false
    window.isMovable = false
    window.isMovableByWindowBackground = false
    window.isExcludedFromWindowsMenu = true
    window.isOpaque = isOpaque
    window.hasShadow = hasShadow
    window.hidesOnDeactivate = hidesOnDeactivate
  }
}
