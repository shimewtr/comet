import Foundation

public struct AppSettings: Codable, Equatable, Sendable {
  public static let defaultRoomID = "global"

  public var webAppURL: String
  public var selectedRoomID: String
  public var overlaysEnabled: Bool
  public var selectedDisplayID: UInt32?
  public var displaySettings: OverlayDisplaySettings

  public init(
    webAppURL: String = "",
    selectedRoomID: String = Self.defaultRoomID,
    overlaysEnabled: Bool = true,
    selectedDisplayID: UInt32? = nil,
    displaySettings: OverlayDisplaySettings = OverlayDisplaySettings()
  ) {
    self.webAppURL = webAppURL
    self.selectedRoomID = selectedRoomID
    self.overlaysEnabled = overlaysEnabled
    self.selectedDisplayID = selectedDisplayID
    self.displaySettings = displaySettings
  }

  private enum CodingKeys: String, CodingKey {
    case webAppURL
    case selectedRoomID
    case overlaysEnabled
    case selectedDisplayID
    case displaySettings
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    webAppURL = try container.decodeIfPresent(String.self, forKey: .webAppURL) ?? ""
    selectedRoomID =
      try container.decodeIfPresent(String.self, forKey: .selectedRoomID) ?? Self.defaultRoomID
    overlaysEnabled = try container.decodeIfPresent(Bool.self, forKey: .overlaysEnabled) ?? true
    selectedDisplayID = try container.decodeIfPresent(UInt32.self, forKey: .selectedDisplayID)
    displaySettings =
      try container.decodeIfPresent(OverlayDisplaySettings.self, forKey: .displaySettings)
      ?? OverlayDisplaySettings()
  }
}
