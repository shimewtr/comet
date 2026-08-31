import Foundation
import Testing

@testable import CometOverlayCore

@Test
func defaultSettingsUseGlobalRoomAndEnableOverlay() {
  let settings = AppSettings()

  #expect(settings.webAppURL.isEmpty)
  #expect(settings.selectedRoomID == "global")
  #expect(settings.overlaysEnabled)
  #expect(!settings.participationQREnabled)
  #expect(!settings.presentationTimerEnabled)
  #expect(settings.presentationTimerDurationSeconds == 600)
  #expect(settings.selectedDisplayID == nil)
  #expect(settings.displaySettings == OverlayDisplaySettings())
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
    overlaysEnabled: false,
    participationQREnabled: true,
    presentationTimerEnabled: true,
    presentationTimerDurationSeconds: 1_500,
    selectedDisplayID: "display-42",
    displaySettings: OverlayDisplaySettings(
      speedScale: 1.5,
      sizeScale: 0.8,
      commentOpacity: 0.7,
      stampOpacity: 0.6,
      displayArea: .topHalf
    )
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

@Test
func settingsDecodeDataSavedBeforeDisplayControlsWereAdded() throws {
  let legacyData = Data(
    #"{"webAppURL":"https://comet.example.com","selectedRoomID":"room-1","overlaysEnabled":false}"#
      .utf8
  )

  let settings = try JSONDecoder().decode(AppSettings.self, from: legacyData)

  #expect(settings.webAppURL == "https://comet.example.com")
  #expect(settings.selectedRoomID == "room-1")
  #expect(!settings.overlaysEnabled)
  #expect(!settings.participationQREnabled)
  #expect(!settings.presentationTimerEnabled)
  #expect(settings.presentationTimerDurationSeconds == 600)
  #expect(settings.selectedDisplayID == nil)
  #expect(settings.displaySettings == OverlayDisplaySettings())
}

@Test
func timerDurationIsClampedWhenSettingsAreCreatedOrDecoded() throws {
  #expect(AppSettings(presentationTimerDurationSeconds: -1).presentationTimerDurationSeconds == 0)
  #expect(
    AppSettings(presentationTimerDurationSeconds: Int.max).presentationTimerDurationSeconds
      == PresentationTimer.maximumDurationSeconds
  )

  let data = Data(#"{"presentationTimerDurationSeconds":999999999}"#.utf8)
  let decoded = try JSONDecoder().decode(AppSettings.self, from: data)
  #expect(decoded.presentationTimerDurationSeconds == PresentationTimer.maximumDurationSeconds)
}

@Test
func decodedDisplaySettingsAreClampedToSupportedRanges() throws {
  let data = Data(
    #"{"speedScale":9,"sizeScale":0,"commentOpacity":0,"stampOpacity":9,"displayArea":"topThird"}"#
      .utf8
  )

  let settings = try JSONDecoder().decode(OverlayDisplaySettings.self, from: data)

  #expect(settings.speedScale == 2)
  #expect(settings.sizeScale == 0.5)
  #expect(settings.commentOpacity == 0.2)
  #expect(settings.stampOpacity == 1)
  #expect(settings.displayArea == .topThird)
}
