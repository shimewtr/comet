import Foundation
import Testing

@testable import CometOverlayCore

@Test
func defaultSettingsUseGlobalRoomAndEnableOverlay() {
  let settings = AppSettings()

  #expect(settings.webAppURL.isEmpty)
  #expect(settings.selectedRoomID == "global")
  #expect(settings.overlaysEnabled)
}

@Test
func settingsRoundTripThroughUserDefaults() throws {
  let suiteName = "comet-overlay-tests-\(UUID().uuidString)"
  let defaults = try #require(UserDefaults(suiteName: suiteName))
  defer { defaults.removePersistentDomain(forName: suiteName) }

  let store = UserDefaultsSettingsStore(defaults: defaults, key: "settings")
  let expected = AppSettings(
    webAppURL: "https://comet.example.com",
    selectedRoomID: "room-1",
    overlaysEnabled: false
  )

  store.save(expected)

  #expect(store.load() == expected)
}

@Test
func invalidStoredSettingsFallBackToDefaults() throws {
  let suiteName = "comet-overlay-tests-\(UUID().uuidString)"
  let defaults = try #require(UserDefaults(suiteName: suiteName))
  defer { defaults.removePersistentDomain(forName: suiteName) }
  defaults.set(Data("not-json".utf8), forKey: "settings")

  let store = UserDefaultsSettingsStore(defaults: defaults, key: "settings")

  #expect(store.load() == AppSettings())
}
