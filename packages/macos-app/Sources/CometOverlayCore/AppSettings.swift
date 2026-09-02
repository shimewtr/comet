import Foundation

public struct AppSettings: Codable, Equatable, Sendable {
  public static let defaultRoomID = "global"

  public var webAppURL: String
  public var selectedRoomID: String
  public var overlaysEnabled: Bool
  public var participationQREnabled: Bool
  public var commentListEnabled: Bool
  public var presentationTimerEnabled: Bool
  public var presentationTimerDurationSeconds: Int
  public var pollControllerID: String
  public var controlledPollID: String?
  public var selectedDisplayID: String?
  public var displaySettings: OverlayDisplaySettings

  public init(
    webAppURL: String = "",
    selectedRoomID: String = Self.defaultRoomID,
    overlaysEnabled: Bool = true,
    participationQREnabled: Bool = false,
    commentListEnabled: Bool = false,
    presentationTimerEnabled: Bool = false,
    presentationTimerDurationSeconds: Int = PresentationTimer.defaultDurationSeconds,
    pollControllerID: String = UUID().uuidString,
    controlledPollID: String? = nil,
    selectedDisplayID: String? = nil,
    displaySettings: OverlayDisplaySettings = OverlayDisplaySettings()
  ) {
    self.webAppURL = webAppURL
    self.selectedRoomID = selectedRoomID
    self.overlaysEnabled = overlaysEnabled
    self.participationQREnabled = participationQREnabled
    self.commentListEnabled = commentListEnabled
    self.presentationTimerEnabled = presentationTimerEnabled
    self.presentationTimerDurationSeconds = Self.clampedTimerDuration(
      presentationTimerDurationSeconds
    )
    self.pollControllerID = pollControllerID.isEmpty ? UUID().uuidString : pollControllerID
    self.controlledPollID = controlledPollID
    self.selectedDisplayID = selectedDisplayID
    self.displaySettings = displaySettings
  }

  private enum CodingKeys: String, CodingKey {
    case webAppURL
    case selectedRoomID
    case overlaysEnabled
    case participationQREnabled
    case commentListEnabled
    case presentationTimerEnabled
    case presentationTimerDurationSeconds
    case pollControllerID
    case controlledPollID
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
    commentListEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .commentListEnabled) ?? false
    presentationTimerEnabled =
      try container.decodeIfPresent(Bool.self, forKey: .presentationTimerEnabled) ?? false
    presentationTimerDurationSeconds = Self.clampedTimerDuration(
      try container.decodeIfPresent(Int.self, forKey: .presentationTimerDurationSeconds)
        ?? PresentationTimer.defaultDurationSeconds
    )
    pollControllerID =
      try container.decodeIfPresent(String.self, forKey: .pollControllerID) ?? UUID().uuidString
    controlledPollID = try container.decodeIfPresent(String.self, forKey: .controlledPollID)
    selectedDisplayID = try container.decodeIfPresent(String.self, forKey: .selectedDisplayID)
    displaySettings =
      try container.decodeIfPresent(OverlayDisplaySettings.self, forKey: .displaySettings)
      ?? OverlayDisplaySettings()
  }

  private static func clampedTimerDuration(_ seconds: Int) -> Int {
    min(max(0, seconds), PresentationTimer.maximumDurationSeconds)
  }
}
