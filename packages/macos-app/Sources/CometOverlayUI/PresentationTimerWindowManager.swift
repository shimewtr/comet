import AppKit
import CometOverlayCore
import SwiftUI

enum PresentationTimerWindowMetrics {
  // Keep enough transparent space around the card for the warning glow. Without this inset,
  // AppKit clips the blur at the window boundary and leaves a visible straight edge.
  static let effectInset: CGFloat = 24
  static let maximumGlowRadius: CGFloat = 19
  static let compactSize = NSSize(width: 222, height: 118)
  static let prominentSize = NSSize(width: 302, height: 174)
  static let expandedSize = NSSize(width: 382, height: 256)

  static func size(for snapshot: PresentationTimerSnapshot, isHovered: Bool) -> NSSize {
    if isHovered { return expandedSize }
    if snapshot.attention == .expired { return prominentSize }
    return compactSize
  }

  static func cardSize(for snapshot: PresentationTimerSnapshot, isHovered: Bool) -> NSSize {
    let windowSize = size(for: snapshot, isHovered: isHovered)
    return NSSize(
      width: windowSize.width - effectInset * 2,
      height: windowSize.height - effectInset * 2
    )
  }

  static func resizedFrame(
    from frame: NSRect,
    to size: NSSize,
    within screenFrame: NSRect
  ) -> NSRect {
    let topCenter = NSPoint(x: frame.midX, y: frame.maxY)
    var origin = NSPoint(x: topCenter.x - size.width / 2, y: topCenter.y - size.height)
    let margin: CGFloat = 8
    origin.x = min(
      max(origin.x, screenFrame.minX + margin),
      screenFrame.maxX - size.width - margin
    )
    origin.y = min(
      max(origin.y, screenFrame.minY + margin),
      screenFrame.maxY - size.height - margin
    )
    return NSRect(origin: origin, size: size)
  }
}

@MainActor
private final class PresentationTimerViewModel: ObservableObject {
  @Published var snapshot: PresentationTimerSnapshot
  @Published var isHovered = false
  var expansionTask: Task<Void, Never>?
  var collapseTask: Task<Void, Never>?

  init(snapshot: PresentationTimerSnapshot) {
    self.snapshot = snapshot
  }

  deinit {
    expansionTask?.cancel()
    collapseTask?.cancel()
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

  public var onStart: (() -> Void)?
  public var onPause: (() -> Void)?
  public var onStop: (() -> Void)?
  public var onAdjust: ((Int) -> Void)?

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
        resizeWindow(timer.window, for: timer.model)
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
    let model = PresentationTimerViewModel(snapshot: snapshot)
    let size = PresentationTimerWindowMetrics.size(for: snapshot, isHovered: false)
    let origin = NSPoint(
      x: screen.frame.midX - size.width / 2,
      y: screen.frame.maxY - size.height - 20
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
    window.contentView = NSHostingView(
      rootView: PresentationTimerView(
        model: model,
        onHover: { [weak self, weak window, weak model] isHovered in
          guard let self, let window, let model else { return }
          self.handleHoverChange(isHovered, window: window, model: model)
        },
        onStart: { [weak self] in self?.onStart?() },
        onPause: { [weak self] in self?.onPause?() },
        onStop: { [weak self] in self?.onStop?() },
        onAdjust: { [weak self] seconds in self?.onAdjust?(seconds) }
      )
    )
    window.setFrameOrigin(origin)
    return ScreenTimer(window: window, model: model)
  }

  private func handleHoverChange(
    _ isHovered: Bool,
    window: NSWindow,
    model: PresentationTimerViewModel
  ) {
    model.collapseTask?.cancel()
    model.collapseTask = nil

    if isHovered {
      guard !model.isHovered else { return }
      model.expansionTask?.cancel()
      // Finish the AppKit layout pass first. Starting the SwiftUI transition in the same frame as
      // the window resize makes the first animation frame noticeably hitch.
      resizeWindow(window, for: model, isHovered: true)
      model.expansionTask = Task { @MainActor [weak model] in
        do {
          try await Task.sleep(for: .milliseconds(16))
          guard !Task.isCancelled, let model else { return }
          withAnimation(.easeOut(duration: 0.2)) {
            model.isHovered = true
          }
          model.expansionTask = nil
        } catch {
          return
        }
      }
      return
    }

    // Resizing a borderless panel can briefly emit hover=false even though the pointer is still
    // inside the expanded frame. Keep it expanded for a short grace period, then wait until the
    // pointer has actually left the panel before collapsing.
    model.collapseTask = Task { @MainActor [weak self, weak window, weak model] in
      do {
        try await Task.sleep(for: .milliseconds(700))
        guard let self, let window, let model else { return }
        while window.frame.contains(NSEvent.mouseLocation) {
          try await Task.sleep(for: .milliseconds(150))
        }
        guard !Task.isCancelled else { return }
        model.expansionTask?.cancel()
        model.expansionTask = nil
        withAnimation(.easeInOut(duration: 0.22)) {
          model.isHovered = false
        }
        try await Task.sleep(for: .milliseconds(240))
        guard !Task.isCancelled, !model.isHovered else { return }
        model.collapseTask = nil
        self.resizeWindow(window, for: model)
      } catch is CancellationError {
        return
      } catch {
        return
      }
    }
  }

  private func resizeWindow(
    _ window: NSWindow,
    for model: PresentationTimerViewModel,
    isHovered: Bool? = nil
  ) {
    let size = PresentationTimerWindowMetrics.size(
      for: model.snapshot,
      isHovered: isHovered ?? model.isHovered
    )
    guard window.frame.size != size else { return }

    let screenFrame = window.screen?.frame ?? NSScreen.main?.frame ?? window.frame
    let frame = PresentationTimerWindowMetrics.resizedFrame(
      from: window.frame,
      to: size,
      within: screenFrame
    )
    window.setFrame(frame, display: true)
  }
}

private struct PresentationTimerView: View {
  @ObservedObject var model: PresentationTimerViewModel
  let onHover: (Bool) -> Void
  let onStart: () -> Void
  let onPause: () -> Void
  let onStop: () -> Void
  let onAdjust: (Int) -> Void

  var body: some View {
    TimelineView(.animation(minimumInterval: 0.1, paused: model.snapshot.attention == .normal)) {
      context in
      panelContent
        .frame(width: cardSize.width, height: cardSize.height)
        .clipped()
        .foregroundStyle(.white)
        .background(backgroundColor, in: RoundedRectangle(cornerRadius: cornerRadius))
        .overlay {
          RoundedRectangle(cornerRadius: cornerRadius)
            .stroke(
              .white.opacity(model.snapshot.attention == .normal ? 0.18 : 0.75),
              lineWidth: 2
            )
        }
        .shadow(
          color: glowColor.opacity(glowOpacity(at: context.date)),
          radius: glowRadius(at: context.date)
        )
        .scaleEffect(pulseScale(at: context.date))
        .padding(PresentationTimerWindowMetrics.effectInset)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .contentShape(Rectangle())
        .onHover(perform: onHover)
    }
  }

  private var cardSize: NSSize {
    PresentationTimerWindowMetrics.cardSize(
      for: model.snapshot,
      isHovered: model.isHovered
    )
  }

  @ViewBuilder
  private var panelContent: some View {
    ZStack {
      compactContent
        .opacity(!model.isHovered && model.snapshot.attention != .expired ? 1 : 0)
        .scaleEffect(model.isHovered ? 0.98 : 1, anchor: .top)
        .accessibilityHidden(model.isHovered || model.snapshot.attention == .expired)

      prominentContent
        .opacity(!model.isHovered && model.snapshot.attention == .expired ? 1 : 0)
        .scaleEffect(model.isHovered ? 0.98 : 1, anchor: .top)
        .accessibilityHidden(model.isHovered || model.snapshot.attention != .expired)

      expandedContent
        .opacity(model.isHovered ? 1 : 0)
        .scaleEffect(model.isHovered ? 1 : 0.98, anchor: .top)
        .allowsHitTesting(model.isHovered)
        .accessibilityHidden(!model.isHovered)
    }
  }

  private var compactContent: some View {
    HStack(spacing: 8) {
      Circle()
        .fill(statusColor)
        .frame(width: 7, height: 7)
      Text(model.snapshot.formattedRemainingTime)
        .font(.system(size: 36, weight: .bold, design: .rounded))
        .monospacedDigit()
        .minimumScaleFactor(0.65)
        .lineLimit(1)
    }
    .padding(.horizontal, 14)
    .padding(.vertical, 8)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityDescription)
  }

  private var prominentContent: some View {
    VStack(spacing: 2) {
      HStack(spacing: 6) {
        Circle()
          .fill(statusColor)
          .frame(width: 8, height: 8)
        Text(statusLabel)
          .font(.system(size: 12, weight: .semibold))
        Spacer()
        Text("TIME UP")
          .font(.system(size: 12, weight: .black))
      }
      Text(model.snapshot.formattedRemainingTime)
        .font(.system(size: 58, weight: .bold, design: .rounded))
        .monospacedDigit()
        .minimumScaleFactor(0.65)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
    }
    .padding(.horizontal, 18)
    .padding(.vertical, 12)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(accessibilityDescription)
  }

  private var expandedContent: some View {
    VStack(spacing: 9) {
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
        .font(.system(size: 52, weight: .bold, design: .rounded))
        .monospacedDigit()
        .minimumScaleFactor(0.65)
        .lineLimit(1)
        .frame(maxWidth: .infinity)
      HStack(spacing: 10) {
        transportButton(
          systemImage: "play.fill",
          label: "スタート",
          isDisabled: model.snapshot.status == .running,
          action: onStart
        )
        transportButton(
          systemImage: "pause.fill",
          label: "一時停止",
          isDisabled: model.snapshot.status != .running,
          action: onPause
        )
        transportButton(systemImage: "stop.fill", label: "停止", action: onStop)
      }
      HStack(spacing: 6) {
        adjustmentButton(systemImage: "minus", value: "1分", seconds: -60)
        adjustmentButton(systemImage: "minus", value: "10秒", seconds: -10)
        adjustmentButton(systemImage: "plus", value: "10秒", seconds: 10)
        adjustmentButton(systemImage: "plus", value: "1分", seconds: 60)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 12)
  }

  private var statusLabel: String {
    switch model.snapshot.status {
    case .stopped:
      "停止中"
    case .running:
      if model.snapshot.overtimeSeconds > 0 {
        "超過"
      } else if model.snapshot.remainingSeconds == 0 {
        "終了"
      } else {
        "進行中"
      }
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

  private var glowColor: Color {
    switch model.snapshot.attention {
    case .normal:
      .black
    case .minuteWarning:
      .orange
    case .expired:
      .red
    }
  }

  private var cornerRadius: CGFloat {
    model.isHovered || model.snapshot.attention == .expired ? 16 : 12
  }

  private var accessibilityDescription: String {
    let timeDescription = model.snapshot.overtimeSeconds > 0 ? "超過時間 " : "残り時間 "
    return timeDescription + model.snapshot.formattedRemainingTime + "、" + statusLabel
  }

  private func transportButton(
    systemImage: String,
    label: String,
    isDisabled: Bool = false,
    action: @escaping () -> Void
  ) -> some View {
    Button(action: action) {
      Image(systemName: systemImage)
        .font(.system(size: 14, weight: .semibold))
        .frame(width: 28, height: 20)
    }
    .buttonStyle(.bordered)
    .accessibilityLabel(label)
    .help(label)
    .disabled(isDisabled)
  }

  private func adjustmentButton(
    systemImage: String,
    value: String,
    seconds: Int
  ) -> some View {
    let actionName = seconds < 0 ? "減らす" : "増やす"
    return Button {
      onAdjust(seconds)
    } label: {
      HStack(spacing: 3) {
        Image(systemName: systemImage)
          .font(.system(size: 10, weight: .bold))
        Text(value)
          .font(.caption2)
          .monospacedDigit()
      }
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.bordered)
    .controlSize(.small)
    .accessibilityLabel(value + actionName)
    .help(value + actionName)
  }

  private func pulseScale(at date: Date) -> CGFloat {
    guard model.snapshot.attention != .normal else { return 1 }
    return 1 + CGFloat(pulseProgress(at: date) * 0.012)
  }

  private func glowOpacity(at date: Date) -> Double {
    guard model.snapshot.attention != .normal else { return 0.28 }
    return 0.42 + pulseProgress(at: date) * 0.38
  }

  private func glowRadius(at date: Date) -> CGFloat {
    guard model.snapshot.attention != .normal else { return 10 }
    let minimumRadius: CGFloat = 13
    return minimumRadius
      + CGFloat(pulseProgress(at: date))
      * (PresentationTimerWindowMetrics.maximumGlowRadius - minimumRadius)
  }

  private func pulseProgress(at date: Date) -> Double {
    (sin(date.timeIntervalSinceReferenceDate * .pi * 2) + 1) / 2
  }
}
