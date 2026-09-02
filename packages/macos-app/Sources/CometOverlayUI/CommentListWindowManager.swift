import AppKit
import CometOverlayCore
import SwiftUI

@MainActor
private final class CommentListViewModel: ObservableObject {
  @Published var comments: [CometComment]
  init(comments: [CometComment]) { self.comments = comments }
}

@MainActor
public final class CommentListWindowManager: NSObject {
  private struct ScreenPanel {
    let window: NSPanel
    let model: CommentListViewModel
  }
  private struct Configuration: Equatable {
    let isEnabled: Bool
    let selectedDisplayID: String?
  }

  private var panels: [CGDirectDisplayID: ScreenPanel] = [:]
  private var configuration: Configuration?

  public override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self, selector: #selector(screenParametersDidChange),
      name: NSApplication.didChangeScreenParametersNotification, object: nil)
  }

  deinit { NotificationCenter.default.removeObserver(self) }

  public func apply(isEnabled: Bool, comments: [CometComment], selectedDisplayID: String?) {
    let updated = Configuration(isEnabled: isEnabled, selectedDisplayID: selectedDisplayID)
    let changed = updated != configuration
    configuration = updated
    guard isEnabled else {
      hideAll()
      return
    }
    if changed {
      refreshWindows(comments: comments)
    } else {
      for panel in panels.values {
        panel.model.comments = comments
      }
    }
  }

  @objc private func screenParametersDidChange() {
    refreshWindows(comments: panels.values.first?.model.comments ?? [])
  }

  private func hideAll() {
    for panel in panels.values {
      panel.window.orderOut(nil)
    }
    panels.removeAll()
  }

  private func refreshWindows(comments: [CometComment]) {
    hideAll()
    guard configuration?.isEnabled == true else { return }
    for screen in selectedScreens() {
      let panel = makePanel(on: screen, comments: comments)
      panels[ScreenIdentity.directDisplayID(for: screen)] = panel
      panel.window.orderFrontRegardless()
    }
  }

  private func selectedScreens() -> [NSScreen] {
    guard let id = configuration?.selectedDisplayID else { return NSScreen.screens }
    if let screen = NSScreen.screens.first(where: { ScreenIdentity.stableDisplayID(for: $0) == id })
    {
      return [screen]
    }
    return NSScreen.main.map { [$0] } ?? []
  }

  private func makePanel(on screen: NSScreen, comments: [CometComment]) -> ScreenPanel {
    let size = NSSize(width: 380, height: 330)
    let origin = NSPoint(
      x: screen.frame.maxX - size.width - 16,
      y: screen.frame.minY + 16
    )
    let window = NSPanel(
      contentRect: NSRect(origin: origin, size: size),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    window.backgroundColor = .clear
    OverlayWindowPolicy.movablePresentation.apply(to: window)
    let model = CommentListViewModel(comments: comments)
    window.contentView = NSHostingView(rootView: CommentListOverlayView(model: model))
    return ScreenPanel(window: window, model: model)
  }
}

private struct CommentListOverlayView: View {
  @ObservedObject var model: CommentListViewModel
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      Text("コメント").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
      if model.comments.isEmpty {
        Text("コメントを待っています").foregroundStyle(.secondary).frame(
          maxWidth: .infinity, maxHeight: .infinity)
      } else {
        VStack(alignment: .leading, spacing: 6) {
          ForEach(model.comments.suffix(8)) { comment in
            CommentListRow(comment: comment)
          }
        }
      }
    }
    .padding(16).frame(width: 360, height: 310, alignment: .topLeading)
    .background(.black.opacity(0.72), in: RoundedRectangle(cornerRadius: 16))
    .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.14), lineWidth: 1))
    .shadow(color: .black.opacity(0.35), radius: 10, y: 4).padding(10)
  }
}

private struct CommentListRow: View {
  let comment: CometComment

  var body: some View {
    Text(comment.content)
      .font(.system(size: 16, weight: .medium))
      .foregroundStyle(Color(hex: comment.style.color))
      .lineLimit(2)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
