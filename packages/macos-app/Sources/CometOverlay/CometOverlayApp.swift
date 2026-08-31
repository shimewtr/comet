import AppKit
import CometOverlayCore
import SwiftUI

@main
struct CometOverlayApp: App {
  @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
  @StateObject private var model = AppModel()

  var body: some Scene {
    MenuBarExtra {
      MenuContent(model: model)
    } label: {
      ToolbarLabel(connectionState: model.connectionState)
    }
    .menuBarExtraStyle(.window)

    Settings {
      SettingsView(model: model)
    }
  }
}

private struct ToolbarLabel: View {
  let connectionState: ConnectionState

  var body: some View {
    Image(nsImage: ToolbarIcon.image(for: connectionState))
      .renderingMode(.original)
      .accessibilityLabel("Comet、\(connectionStatus)")
      .help("Comet：\(connectionStatus)")
  }

  private var connectionStatus: String {
    switch connectionState {
    case .connected:
      "接続済み"
    case .connecting:
      "接続中"
    case .failed:
      "接続エラー"
    case .disconnected:
      "未接続"
    }
  }
}

private enum ToolbarIcon {
  private static let source: NSImage =
    Bundle.main.url(forResource: "ToolbarIcon", withExtension: "png")
    .flatMap(NSImage.init(contentsOf:))
    ?? Bundle.module.url(forResource: "ToolbarIcon", withExtension: "png")
    .flatMap(NSImage.init(contentsOf:))
    ?? NSImage(systemSymbolName: "sparkles", accessibilityDescription: "Comet")!

  static func image(for connectionState: ConnectionState) -> NSImage {
    let canvasSize = NSSize(width: 22, height: 18)
    let image = NSImage(size: canvasSize, flipped: false) { _ in
      let iconRect = NSRect(x: 0, y: 0, width: 18, height: 18)
      source.draw(in: iconRect)

      // 元画像のアルファをマスクとして使い、メニューバーに適した文字色で描く。
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

  private static func statusColor(for connectionState: ConnectionState) -> NSColor {
    switch connectionState {
    case .connected:
      .systemGreen
    case .connecting:
      .systemOrange
    case .failed:
      .systemRed
    case .disconnected:
      .systemGray
    }
  }
}

private struct MenuContent: View {
  @Environment(\.openSettings) private var openSettings
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 8) {
        Circle()
          .fill(connectionColor)
          .frame(width: 8, height: 8)
        VStack(alignment: .leading, spacing: 2) {
          Text("Comet")
            .font(.headline)
          Text(model.connectionDescription)
            .font(.caption)
            .foregroundStyle(.secondary)
            .lineLimit(2)
        }
        Spacer()
      }

      VStack(alignment: .leading, spacing: 4) {
        Text("WebアプリURL")
          .font(.caption)
          .foregroundStyle(.secondary)
        TextField("https://example.com", text: $model.settings.webAppURL)
          .textFieldStyle(.roundedBorder)
      }

      Button(connectionActionTitle) {
        if model.connectionState == .connected {
          model.disconnect()
        } else {
          model.connect()
        }
      }
      .buttonStyle(.borderedProminent)
      .controlSize(.large)
      .frame(maxWidth: .infinity)
      .disabled(!connectionActionEnabled)

      Toggle("オーバーレイを表示", isOn: $model.settings.overlaysEnabled)
      Toggle("参加用QRコードを表示", isOn: $model.settings.participationQREnabled)
        .disabled(model.settings.webAppURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
      Toggle("タイマーを表示", isOn: $model.settings.presentationTimerEnabled)

      GroupBox {
        VStack(alignment: .leading, spacing: 10) {
          Picker(
            "Room",
            selection: Binding(
              get: { model.settings.selectedRoomID },
              set: { model.selectRoom($0) }
            )
          ) {
            ForEach(model.rooms) { room in
              Text(room.name).tag(room.id)
            }
          }
          .disabled(model.connectionState != .connected)

          Picker("出力先", selection: $model.settings.selectedDisplayID) {
            Text("すべてのディスプレイ").tag(String?.none)
            ForEach(model.displays) { display in
              Text(display.name).tag(Optional(display.id))
            }
          }
        }
      }

      Divider()
      Button("ログアウト") {
        model.logout()
      }
      .disabled(!model.canLogout)
      Button("詳細設定") {
        showSettings()
      }
      Button("Cometを終了") {
        NSApplication.shared.terminate(nil)
      }
    }
    .padding()
    .frame(width: 330)
  }

  private var connectionColor: Color {
    switch model.connectionState {
    case .connected:
      .green
    case .connecting:
      .orange
    case .failed:
      .red
    case .disconnected:
      .secondary
    }
  }

  private var connectionActionTitle: String {
    switch model.connectionState {
    case .connected:
      "接続を切る"
    case .connecting:
      "接続中…"
    default:
      "接続する"
    }
  }

  private var connectionActionEnabled: Bool {
    switch model.connectionState {
    case .connected:
      true
    case .connecting:
      false
    default:
      model.canConnect
    }
  }

  private func showSettings() {
    openSettings()
    NSApplication.shared.activate(ignoringOtherApps: true)
    Task { @MainActor in
      // Settings Sceneのウィンドウ生成を待ってから、ほかのアプリより前へ出す。
      try? await Task.sleep(for: .milliseconds(100))
      NSApplication.shared.activate(ignoringOtherApps: true)
      let settingsWindow = NSApplication.shared.windows.first {
        !($0 is NSPanel) && $0.canBecomeKey
      }
      settingsWindow?.makeKeyAndOrderFront(nil)
    }
  }
}

private struct SettingsView: View {
  @ObservedObject var model: AppModel
  @State private var showsResetConfirmation = false

  var body: some View {
    Form {
      Section("接続") {
        LabeledContent("状態", value: model.connectionDescription)
        Text("WebアプリURL、接続、Room、出力先の操作はメニューバーから行います。")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Section("認証") {
        LabeledContent("状態", value: model.authenticationDescription)
        Button("ログアウト") {
          model.logout()
        }
        .disabled(!model.canLogout)
        Text("ログアウトすると、KeychainのComet認証チケットとブラウザのCometセッションを削除します。")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Section("表示") {
        Toggle("参加用QRコードを表示", isOn: $model.settings.participationQREnabled)
        Text("WebアプリURLのQRコードを、選択した出力先の右下へ最前面表示します。")
          .font(.caption)
          .foregroundStyle(.secondary)
        SettingsSlider(
          title: "コメント速度",
          value: $model.settings.displaySettings.speedScale,
          range: 0.5...2,
          step: 0.1,
          valueText: { String(format: "%.1fx", $0) }
        )
        SettingsSlider(
          title: "文字・スタンプサイズ",
          value: $model.settings.displaySettings.sizeScale,
          range: 0.5...2,
          step: 0.1,
          valueText: { String(format: "%.1fx", $0) }
        )
        SettingsSlider(
          title: "コメントの濃さ",
          value: $model.settings.displaySettings.commentOpacity,
          range: 0.2...1,
          step: 0.05,
          valueText: { "\(Int($0 * 100))%" }
        )
        SettingsSlider(
          title: "スタンプの濃さ",
          value: $model.settings.displaySettings.stampOpacity,
          range: 0.2...1,
          step: 0.05,
          valueText: { "\(Int($0 * 100))%" }
        )
        Picker("表示領域", selection: $model.settings.displaySettings.displayArea) {
          Text("画面全体").tag(OverlayDisplayArea.full)
          Text("上半分").tag(OverlayDisplayArea.topHalf)
          Text("上1/3").tag(OverlayDisplayArea.topThird)
        }
        Button("コメントとスタンプをテスト表示") {
          if !model.settings.overlaysEnabled {
            model.settings.overlaysEnabled = true
          }
          model.previewOverlay()
        }
      }

      Section("タイマー") {
        Toggle("タイマーを表示", isOn: $model.settings.presentationTimerEnabled)
        Text("選択した出力先の上部へ最前面表示します。タイマーへポインタを重ねると操作ボタンが表示されます。")
          .font(.caption)
          .foregroundStyle(.secondary)
      }

      Section("詳細") {
        LabeledContent("Comet", value: AppMetadata.versionDescription)
        Text("診断ログにURL、投稿内容、認証チケットは記録しません。")
          .font(.caption)
          .foregroundStyle(.secondary)
        Button("設定を初期値に戻す", role: .destructive) {
          showsResetConfirmation = true
        }
      }
    }
    .formStyle(.grouped)
    .padding()
    .frame(width: 560, height: 720)
    .confirmationDialog(
      "すべての設定を初期値に戻しますか？",
      isPresented: $showsResetConfirmation,
      titleVisibility: .visible
    ) {
      Button("初期値に戻す", role: .destructive) {
        model.resetSettings()
      }
      Button("キャンセル", role: .cancel) {}
    } message: {
      Text("WebアプリURL、表示調整、Room、出力先がリセットされ、接続が切れます。")
    }
  }
}

private struct SettingsSlider: View {
  let title: String
  @Binding var value: Double
  let range: ClosedRange<Double>
  let step: Double
  let valueText: (Double) -> String

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
        Spacer()
        Text(valueText(value))
          .monospacedDigit()
          .foregroundStyle(.secondary)
      }
      Slider(value: $value, in: range, step: step)
    }
  }
}
