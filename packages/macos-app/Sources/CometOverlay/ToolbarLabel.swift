import AppKit
import CometOverlayCore
import SwiftUI

struct ToolbarLabel: View {
  let connectionState: ConnectionState

  var body: some View {
    Image(nsImage: ToolbarIcon.image(for: connectionState))
      .renderingMode(.original)
      .accessibilityLabel("Comet、\(connectionStatus)")
      .help("Comet：\(connectionStatus)")
  }

  private var connectionStatus: String {
    switch connectionState {
    case .connected: "接続済み"
    case .connecting: "接続中"
    case .failed: "接続エラー"
    case .disconnected: "未接続"
    }
  }
}

enum ToolbarIcon {
  private static let source: NSImage =
    Bundle.main.url(forResource: "ToolbarIcon", withExtension: "png")
    .flatMap(NSImage.init(contentsOf:))
    ?? Bundle.module.url(forResource: "ToolbarIcon", withExtension: "png")
    .flatMap(NSImage.init(contentsOf:))
    ?? NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Comet")!

  static func image(for connectionState: ConnectionState) -> NSImage {
    let image = NSImage(size: NSSize(width: 22, height: 18), flipped: false) { _ in
      let iconRect = NSRect(x: 0, y: 0, width: 18, height: 18)
      source.draw(in: iconRect)
      NSColor.labelColor.setFill()
      iconRect.fill(using: .sourceAtop)
      let badgeRect = NSRect(x: 14, y: 0, width: 8, height: 8)
      NSColor.windowBackgroundColor.setFill()
      NSBezierPath(ovalIn: badgeRect).fill()
      statusColor(for: connectionState).setFill()
      NSBezierPath(ovalIn: badgeRect.insetBy(dx: 0.5, dy: 0.5)).fill()
      return true
    }
    image.isTemplate = false
    return image
  }

  private static func statusColor(for state: ConnectionState) -> NSColor {
    switch state {
    case .connected: .systemGreen
    case .connecting: .systemOrange
    case .failed: .systemRed
    case .disconnected: .systemGray
    }
  }
}
