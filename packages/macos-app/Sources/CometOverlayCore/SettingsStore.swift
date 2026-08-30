import Foundation

public protocol SettingsStoring: Sendable {
  func load() -> AppSettings
  func save(_ settings: AppSettings)
}

public final class UserDefaultsSettingsStore: SettingsStoring, @unchecked Sendable {
  private let defaults: UserDefaults
  private let key: String

  public init(
    defaults: UserDefaults = .standard,
    key: String = "comet.overlay.settings"
  ) {
    self.defaults = defaults
    self.key = key
  }

  public func load() -> AppSettings {
    guard
      let data = defaults.data(forKey: key),
      let settings = try? JSONDecoder().decode(AppSettings.self, from: data)
    else {
      return AppSettings()
    }
    return settings
  }

  public func save(_ settings: AppSettings) {
    guard let data = try? JSONEncoder().encode(settings) else { return }
    defaults.set(data, forKey: key)
  }
}
