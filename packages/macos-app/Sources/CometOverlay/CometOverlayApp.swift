import AppKit
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
      Toggle("オーバーレイを表示", isOn: $model.settings.overlaysEnabled)
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
      TextField("WebアプリURL", text: $model.settings.webAppURL)
      TextField("Room ID", text: $model.settings.selectedRoomID)
      Toggle("オーバーレイを表示", isOn: $model.settings.overlaysEnabled)
    }
    .formStyle(.grouped)
    .padding()
    .frame(width: 480, height: 220)
  }
}
