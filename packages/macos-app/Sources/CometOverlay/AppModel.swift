import Combine
import CometOverlayCore
import Foundation

@MainActor
final class AppModel: ObservableObject {
  @Published var settings: AppSettings {
    didSet { settingsStore.save(settings) }
  }

  @Published private(set) var connectionState: ConnectionState = .disconnected

  private let settingsStore: any SettingsStoring

  init(settingsStore: any SettingsStoring = UserDefaultsSettingsStore()) {
    self.settingsStore = settingsStore
    settings = settingsStore.load()
  }

  var connectionDescription: String {
    switch connectionState {
    case .disconnected:
      "未接続"
    case .connecting:
      "接続中"
    case .connected:
      "接続済み"
    case .failed(let message):
      "エラー: \(message)"
    }
  }
}
