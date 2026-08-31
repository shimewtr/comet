import Foundation

public struct AppSettings: Codable, Equatable, Sendable {
  public static let defaultRoomID = "global"

  public var webAppURL: String
  public var selectedRoomID: String
  public var overlaysEnabled: Bool
  public var participationQREnabled: Bool
  public var presentationTimerEnabled: Bool
  public var presentationTimerDurationSeconds: Int
  public var selectedDisplayID: String?
  public var displaySettings: OverlayDisplaySettings

  public init(
    webAppURL: String = "",
    selectedRoomID: String = Self.defaultRoomID,
    overlaysEnabled: Bool = true,
    participationQREnabled: Bool = false,
    presentationTimerEnabled: Bool = false,
    presentationTimerDurationSeconds: Int = PresentationTimer.defaultDurationSeconds,
    selectedDisplayID: String? = nil,
    displaySettings: OverlayDisplaySettings = OverlayDisplaySettings()
  ) {
    self.webAppURL = webAppURL
    self.selectedRoomID = selectedRoomID
    self.overlaysEnabled = overlaysEnabled
    self.participationQREnabled = participationQREnabled
    self.presentationTimerEnabled = presentationTimerEnabled
    self.presentationTimerDurationSeconds = Self.clampedTimerDuration(
      presentationTimerDurationSeconds
    )
    self.selectedDisplayID = selectedDisplayID
    self.displaySettings = displaySettings
  }

  private enum CodingKeys: String, CodingKey {
    case webAppURL
    case selectedRoomID
    case overlaysEnabled
    case participationQREnabled
    case presentationTimerEnabled
    case presentationTimerDurationSeconds
    case selectedDisplayID
    case displaySettings
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    webAppURL = try container.decodeIfPresent(String.self, forKey: .webAppURL) ?? ""
    selectedRoomID =
      try container.decodeIfPresent(String.self, forKey: .selectedRoomID) ?? Self.defaultRoomID
    overlaysEnabled = try container.decodeIfPresent(Bool.self, forKey: .overlaysEnabled) ?? true
    participationQREnabled =
      try container.decodeIfPresent(Bool.self, forKey: .participationQREnabled) ?? false
    presentationTimerEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .presentationTimerEnabled) ?? false
    presentationTimerDurationSeconds = Self.clampedTimerDuration(
      try container.decodeIfPresent(Int.self, forKey: .presentationTimerDurationSeconds)
        ?? PresentationTimer.defaultDurationSeconds
    )
    selectedDisplayID = try container.decodeIfPresent(String.self, forKey: .selectedDisplayID)
    displaySettings =
      try container.decodeIfPresent(OverlayDisplaySettings.self, forKey: .displaySettings)
      ?? OverlayDisplaySettings()
  }

  private static func clampedTimerDuration(_ seconds: Int) -> Int {
    min(max(0, seconds), PresentationTimer.maximumDurationSeconds)
  }
}
