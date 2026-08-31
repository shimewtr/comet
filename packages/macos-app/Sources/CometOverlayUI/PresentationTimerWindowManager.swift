import AppKit
import CometOverlayCore
import SwiftUI

@MainActor
private final class PresentationTimerViewModel: ObservableObject {
  @Published var snapshot: PresentationTimerSnapshot

  init(snapshot: PresentationTimerSnapshot) {
    self.snapshot = snapshot
  }
}

@MainActor
public final class PresentationTimerWindowManager: NSObject {
  private struct ScreenTimer {
    let window: NSPanel
    let model: PresentationTimerViewModel
  }

  private struct Configuration: Equatable {
    let isEnabled: Bool
    let selectedDisplayID: String?
  }

  private var timers: [CGDirectDisplayID: ScreenTimer] = [:]
  private var configuration = Configuration(isEnabled: false, selectedDisplayID: nil)
  private var snapshot = PresentationTimerSnapshot(
    status: .stopped,
    remainingSeconds: PresentationTimer.defaultDurationSeconds,
    attention: .normal
  )

  public override init() {
    super.init()
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

  public func apply(
    isEnabled: Bool,
    selectedDisplayID: String?,
    snapshot: PresentationTimerSnapshot
  ) {
    let updatedConfiguration = Configuration(
      isEnabled: isEnabled,
      selectedDisplayID: selectedDisplayID
    )
    let needsWindowRefresh = updatedConfiguration != configuration
    configuration = updatedConfiguration
    self.snapshot = snapshot

    if needsWindowRefresh {
      refreshWindows()
    } else {
      for timer in timers.values {
        timer.model.snapshot = snapshot
      }
    }
  }

  @objc private func screenParametersDidChange() {
    refreshWindows()
  }

  private func refreshWindows() {
    for timer in timers.values {
      timer.window.orderOut(nil)
    }
    timers.removeAll()

    guard configuration.isEnabled else { return }
    for screen in selectedScreens() {
      let timer = makeTimer(on: screen)
      timers[ScreenIdentity.directDisplayID(for: screen)] = timer
      timer.window.orderFrontRegardless()
    }
  }

  private func selectedScreens() -> [NSScreen] {
    guard let selectedDisplayID = configuration.selectedDisplayID else { return NSScreen.screens }
    if let screen = NSScreen.screens.first(where: {
      ScreenIdentity.stableDisplayID(for: $0) == selectedDisplayID
    }) {
      return [screen]
    }
    return NSScreen.main.map { [$0] } ?? []
  }

  private func makeTimer(on screen: NSScreen) -> ScreenTimer {
    let size = NSSize(width: 270, height: 142)
    let origin = NSPoint(
      x: screen.frame.maxX - size.width - 20, y: screen.frame.maxY - size.height - 20)
    let model = PresentationTimerViewModel(snapshot: snapshot)
    let window = NSPanel(
      contentRect: NSRect(origin: origin, size: size),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    window.backgroundColor = .clear
    OverlayWindowPolicy.presentation.apply(to: window)
    window.contentView = NSHostingView(rootView: PresentationTimerView(model: model))
    window.setFrameOrigin(origin)
    return ScreenTimer(window: window, model: model)
  }
}

private struct PresentationTimerView: View {
  @ObservedObject var model: PresentationTimerViewModel

  var body: some View {
    TimelineView(.animation(minimumInterval: 0.1, paused: model.snapshot.attention == .normal)) {
      context in
      let pulse = pulseScale(at: context.date)
      VStack(spacing: 2) {
        HStack(spacing: 6) {
          Circle()
            .fill(statusColor)
            .frame(width: 8, height: 8)
          Text(statusLabel)
            .font(.system(size: 12, weight: .semibold))
          Spacer()
          if model.snapshot.attention == .expired {
            Text("TIME UP")
              .font(.system(size: 12, weight: .black))
          }
        }
        Text(model.snapshot.formattedRemainingTime)
          .font(.system(size: 58, weight: .bold, design: .rounded))
          .monospacedDigit()
          .minimumScaleFactor(0.65)
          .lineLimit(1)
          .frame(maxWidth: .infinity)
      }
      .foregroundStyle(.white)
      .padding(.horizontal, 18)
      .padding(.vertical, 12)
      .background(backgroundColor, in: RoundedRectangle(cornerRadius: 16))
      .overlay {
        RoundedRectangle(cornerRadius: 16)
          .stroke(.white.opacity(model.snapshot.attention == .normal ? 0.18 : 0.75), lineWidth: 2)
      }
      .shadow(color: shadowColor, radius: 12, y: 4)
      .scaleEffect(pulse)
      .padding(10)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel("残り時間 (model.snapshot.formattedRemainingTime)、(statusLabel)")
    }
  }

  private var statusLabel: String {
    switch model.snapshot.status {
    case .stopped:
      "停止中"
    case .running:
      "進行中"
    case .paused:
      "一時停止"
    }
  }

  private var statusColor: Color {
    switch model.snapshot.status {
    case .stopped:
      .secondary
    case .running:
      .green
    case .paused:
      .yellow
    }
  }

  private var backgroundColor: Color {
    switch model.snapshot.attention {
    case .normal:
      .black.opacity(0.78)
    case .minuteWarning:
      .orange.opacity(0.94)
    case .expired:
      .red.opacity(0.95)
    }
  }

  private var shadowColor: Color {
    switch model.snapshot.attention {
    case .normal:
      .black.opacity(0.35)
    case .minuteWarning:
      .orange.opacity(0.85)
    case .expired:
      .red.opacity(0.9)
    }
  }

  private func pulseScale(at date: Date) -> CGFloat {
    guard model.snapshot.attention != .normal else { return 1 }
    let wave = (sin(date.timeIntervalSinceReferenceDate * .pi * 2) + 1) / 2
    return 1 + CGFloat(wave * 0.045)
  }
}
