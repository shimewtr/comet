import AppKit
import CometOverlayCore
import SwiftUI

@MainActor
private final class PollOverlayViewModel: ObservableObject {
  @Published var poll: PresentationPoll

  init(poll: PresentationPoll) {
    self.poll = poll
  }
}

@MainActor
public final class PollWindowManager: NSObject {
  private struct ScreenPanel {
    let window: NSPanel
    let model: PollOverlayViewModel
  }

  private struct Configuration: Equatable {
    let selectedDisplayID: String?
    let pollID: String?
  }

  private var panels: [CGDirectDisplayID: ScreenPanel] = [:]
  private var configuration = Configuration(selectedDisplayID: nil, pollID: nil)
  private var poll: PresentationPoll?

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

  public func apply(selectedDisplayID: String?, poll: PresentationPoll?) {
    let updatedConfiguration = Configuration(
      selectedDisplayID: selectedDisplayID,
      pollID: poll?.id
    )
    let needsRefresh = updatedConfiguration != configuration
    configuration = updatedConfiguration
    self.poll = poll

    guard let poll else {
      hideAll()
      return
    }
    if needsRefresh {
      refreshWindows()
      return
    }
    for panel in panels.values {
      panel.model.poll = poll
      resize(panel.window, for: poll)
    }
  }

  @objc private func screenParametersDidChange() {
    refreshWindows()
  }

  private func hideAll() {
    for panel in panels.values {
      panel.window.orderOut(nil)
    }
    panels.removeAll()
  }

  private func refreshWindows() {
    hideAll()
    guard let poll else { return }
    for screen in OverlayScreenSelector.screens(selectedDisplayID: configuration.selectedDisplayID)
    {
      let panel = makePanel(on: screen, poll: poll)
      panels[ScreenIdentity.directDisplayID(for: screen)] = panel
      panel.window.orderFrontRegardless()
    }
  }

  private func makePanel(on screen: NSScreen, poll: PresentationPoll) -> ScreenPanel {
    let size = size(for: poll)
    let origin = NSPoint(x: screen.frame.minX + 28, y: screen.frame.maxY - size.height - 48)
    let window = OverlayPanelFactory.make(
      contentRect: NSRect(origin: origin, size: size), on: screen)
    let model = PollOverlayViewModel(poll: poll)
    window.contentView = NSHostingView(rootView: PollOverlayView(model: model))
    return ScreenPanel(window: window, model: model)
  }

  private func resize(_ window: NSWindow, for poll: PresentationPoll) {
    let targetSize = size(for: poll)
    guard window.frame.size != targetSize else { return }
    let topLeft = NSPoint(x: window.frame.minX, y: window.frame.maxY)
    window.setFrame(
      NSRect(
        x: topLeft.x,
        y: topLeft.y - targetSize.height,
        width: targetSize.width,
        height: targetSize.height
      ),
      display: true
    )
  }

  private func size(for poll: PresentationPoll) -> NSSize {
    poll.status == .active
      ? NSSize(width: 390, height: 290)
      : NSSize(width: 530, height: 330)
  }
}

private struct PollOverlayView: View {
  @ObservedObject var model: PollOverlayViewModel
  @State private var showsResultBars = false

  var body: some View {
    TimelineView(.periodic(from: .now, by: 0.2)) { context in
      Group {
        if model.poll.status == .active {
          activeContent(at: context.date)
        } else {
          resultContent
        }
      }
      .padding(20)
      .foregroundStyle(.white)
      .background(.black.opacity(0.82), in: RoundedRectangle(cornerRadius: 20))
      .overlay {
        RoundedRectangle(cornerRadius: 20)
          .stroke(borderColor, lineWidth: 1)
      }
      .shadow(color: .black.opacity(0.45), radius: 16, y: 6)
      .padding(16)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
    .onAppear { revealResultBars() }
    .onChange(of: model.poll.status) { _, _ in revealResultBars() }
  }

  @ViewBuilder
  private func activeContent(at date: Date) -> some View {
    VStack(alignment: .leading, spacing: 13) {
      HStack {
        Label("投票中", systemImage: "chart.bar.xaxis")
          .font(.headline)
          .foregroundStyle(.orange)
        Spacer()
        Text(remainingTime(at: date))
          .font(.system(.title3, design: .rounded).weight(.bold))
          .monospacedDigit()
      }
      if !model.poll.title.isEmpty {
        Text(model.poll.title)
          .font(.title3.weight(.bold))
          .lineLimit(2)
      }
      VStack(alignment: .leading, spacing: 8) {
        ForEach(model.poll.options) { option in
          HStack(spacing: 10) {
            Text(option.emoji).font(.title2)
            Text(option.label).font(.body.weight(.medium))
            Spacer()
          }
          .padding(.vertical, 3)
        }
      }
      Spacer(minLength: 0)
      Text("スタンプで投票できます")
        .font(.caption)
        .foregroundStyle(.white.opacity(0.68))
    }
  }

  private var resultContent: some View {
    VStack(alignment: .leading, spacing: 14) {
      HStack(alignment: .firstTextBaseline) {
        VStack(alignment: .leading, spacing: 2) {
          Text("投票結果").font(.headline).foregroundStyle(.yellow)
          if !model.poll.title.isEmpty {
            Text(model.poll.title).font(.title3.weight(.bold)).lineLimit(2)
          }
        }
        Spacer()
        Text("\(model.poll.totalVotes)票")
          .font(.title3.weight(.bold))
          .monospacedDigit()
      }
      if model.poll.totalVotes == 0 {
        Spacer()
        Text("投票はありませんでした")
          .frame(maxWidth: .infinity)
          .foregroundStyle(.white.opacity(0.76))
        Spacer()
      } else {
        VStack(spacing: 11) {
          ForEach(model.poll.options) { option in
            resultRow(for: option)
          }
        }
      }
    }
  }

  private func resultRow(for option: PresentationPollOption) -> some View {
    let result = model.poll.results?.first(where: { $0.optionId == option.id })
    let percentage = result?.percentage ?? 0
    let winners = model.poll.results?.map(\.count).max() ?? 0
    let isWinner = winners > 0 && result?.count == winners
    return VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 8) {
        Text(option.emoji).font(.title3)
        Text(option.label).font(.subheadline.weight(isWinner ? .bold : .medium))
        Spacer()
        Text("\(result?.count ?? 0)票 \(Int(percentage.rounded()))%")
          .font(.caption.weight(.semibold))
          .monospacedDigit()
          .foregroundStyle(.white.opacity(0.86))
      }
      GeometryReader { proxy in
        Capsule()
          .fill(.white.opacity(0.16))
          .overlay(alignment: .leading) {
            Capsule()
              .fill(isWinner ? .yellow : .orange)
              .frame(width: proxy.size.width * (showsResultBars ? percentage / 100 : 0))
          }
      }
      .frame(height: 12)
    }
  }

  private var borderColor: Color {
    model.poll.status == .active ? .orange.opacity(0.78) : .yellow.opacity(0.82)
  }

  private func remainingTime(at date: Date) -> String {
    let remaining = max(
      0, Int(ceil(Double(model.poll.endsAt) / 1_000 - date.timeIntervalSince1970)))
    return String(format: "%02d:%02d", remaining / 60, remaining % 60)
  }

  private func revealResultBars() {
    showsResultBars = false
    guard model.poll.status == .ended else { return }
    DispatchQueue.main.async {
      withAnimation(.easeOut(duration: 0.7)) {
        showsResultBars = true
      }
    }
  }
}
