import AppKit
import SwiftUI

struct MenuContent: View {
  @Environment(\.openSettings) private var openSettings
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        Circle().fill(connectionColor).frame(width: 8, height: 8)
        VStack(alignment: .leading, spacing: 2) {
          Text("Comet").font(.headline)
          Text(model.connectionDescription).font(.caption).foregroundStyle(.secondary).lineLimit(2)
        }
        Spacer()
      }
      VStack(alignment: .leading, spacing: 4) {
        Text("WebアプリURL").font(.caption).foregroundStyle(.secondary)
        TextField("https://example.com", text: $model.settings.webAppURL).textFieldStyle(
          .roundedBorder)
      }
      Button(connectionActionTitle) {
        model.connectionState == .connected ? model.disconnect() : model.connect()
      }
      .buttonStyle(.borderedProminent).controlSize(.large).frame(maxWidth: .infinity).disabled(
        !connectionActionEnabled)
      Toggle("オーバーレイを表示", isOn: $model.settings.overlaysEnabled)
      Toggle("参加用QRコードを表示", isOn: $model.settings.participationQREnabled)
        .disabled(model.settings.webAppURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      Toggle("タイマーを表示", isOn: $model.settings.presentationTimerEnabled)
      GroupBox("投票") {
        if let poll = model.poll {
          PollStatusMenu(model: model, poll: poll)
        } else if model.isPreparingPoll {
          PollSetupMenu(model: model)
        } else {
          Button("投票を開始…") { model.showPollSetup() }
            .disabled(model.connectionState != .connected)
        }
      }
      if let pollMessage = model.pollMessage {
        Text(pollMessage).font(.caption).foregroundStyle(.red)
      }
      GroupBox {
        VStack(alignment: .leading, spacing: 10) {
          Picker(
            "Room",
            selection: Binding(
              get: { model.settings.selectedRoomID }, set: { model.selectRoom($0) })
          ) {
            ForEach(model.rooms) { room in Text(room.name).tag(room.id) }
          }
          .disabled(model.connectionState != .connected || model.poll?.status == .active)
          Picker("出力先", selection: $model.settings.selectedDisplayID) {
            Text("すべてのディスプレイ").tag(String?.none)
            ForEach(model.displays) { display in Text(display.name).tag(Optional(display.id)) }
          }
        }
      }
      Divider()
      Button("ログアウト") { model.logout() }.disabled(!model.canLogout)
      Button("詳細設定") { showSettings() }
      Button("Cometを終了") { NSApplication.shared.terminate(nil) }
    }
    .padding().frame(width: 330)
  }

  private var connectionColor: Color {
    switch model.connectionState {
    case .connected: .green
    case .connecting: .orange
    case .failed: .red
    case .disconnected: .secondary
    }
  }
  private var connectionActionTitle: String {
    switch model.connectionState {
    case .connected: "接続を切る"
    case .connecting: "接続中…"
    default: "接続する"
    }
  }
  private var connectionActionEnabled: Bool {
    model.connectionState == .connected
      || (model.connectionState != .connecting && model.canConnect)
  }
  private func showSettings() {
    openSettings()
    NSApplication.shared.activate(ignoringOtherApps: true)
    Task { @MainActor in
      try? await Task.sleep(for: .milliseconds(100))
      NSApplication.shared.activate(ignoringOtherApps: true)
      NSApplication.shared.windows.first { !($0 is NSPanel) && $0.canBecomeKey }?
        .makeKeyAndOrderFront(nil)
    }
  }
}
