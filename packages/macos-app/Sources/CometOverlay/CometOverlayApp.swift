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
      Label("Comet", systemImage: "sparkles")
    }
    .menuBarExtraStyle(.window)

    Settings {
      SettingsView(model: model)
    }
  }
}

private struct MenuContent: View {
  @ObservedObject var model: AppModel

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text("Comet")
        .font(.headline)
      Text(model.connectionDescription)
        .foregroundStyle(.secondary)
      if model.authenticationRequired {
        Text(model.authenticationDescription)
          .foregroundStyle(.secondary)
      }
      HStack {
        Button("接続") { model.connect() }
          .disabled(!model.canConnect || model.connectionState == .connected)
        Button("切断") { model.disconnect() }
          .disabled(model.connectionState == .disconnected)
        if model.isAuthenticated {
          Button("ログアウト") { model.logout() }
        }
      }
      Toggle("オーバーレイを表示", isOn: $model.settings.overlaysEnabled)
      Button("テスト表示") { model.previewOverlay() }
        .disabled(!model.settings.overlaysEnabled)
      Button("表示を緊急停止", role: .destructive) {
        model.stopOverlayImmediately()
      }
      .disabled(!model.settings.overlaysEnabled)
      Divider()
      SettingsLink {
        Text("設定…")
      }
      Button("終了") {
        NSApplication.shared.terminate(nil)
      }
    }
    .padding()
    .frame(width: 260)
  }
}

private struct SettingsView: View {
  @ObservedObject var model: AppModel

  var body: some View {
    Form {
      Section("接続") {
        TextField("WebアプリURL", text: $model.settings.webAppURL)
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
        HStack {
          Button("接続") { model.connect() }
            .disabled(!model.canConnect || model.connectionState == .connected)
          Button("Room一覧を更新") { model.refreshRooms() }
            .disabled(model.connectionState != .connected)
          Button("切断") { model.disconnect() }
            .disabled(model.connectionState == .disconnected)
        }
        Text(model.connectionDescription)
          .foregroundStyle(.secondary)
        if model.authenticationRequired {
          HStack {
            Text("認証")
            Spacer()
            Text(model.authenticationDescription)
              .foregroundStyle(.secondary)
            if model.isAuthenticated {
              Button("ログアウト") { model.logout() }
            }
          }
        }
      }

      Section("オーバーレイ") {
        Toggle("表示する", isOn: $model.settings.overlaysEnabled)
        Picker("出力先", selection: $model.settings.selectedDisplayID) {
          Text("すべてのディスプレイ").tag(String?.none)
          ForEach(model.displays) { display in
            Text(display.name).tag(Optional(display.id))
          }
        }
        Button("コメントとスタンプをテスト表示") {
          model.previewOverlay()
        }
        .disabled(!model.settings.overlaysEnabled)
      }

      Section("表示調整") {
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
      }

      Section {
        Button("表示を緊急停止", role: .destructive) {
          model.stopOverlayImmediately()
        }
        .disabled(!model.settings.overlaysEnabled)
      }
    }
    .formStyle(.grouped)
    .padding()
    .frame(width: 560, height: 680)
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
