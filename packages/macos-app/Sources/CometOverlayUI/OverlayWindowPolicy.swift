import AppKit

public struct OverlayWindowPolicy: Sendable {
  public static let presentation = OverlayWindowPolicy(
    level: .floating,
    collectionBehavior: [
      .canJoinAllSpaces, .fullScreenAuxiliary, .stationary, .ignoresCycle,
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
    window.isOpaque = isOpaque
    window.hasShadow = hasShadow
    window.hidesOnDeactivate = hidesOnDeactivate
  }
}
