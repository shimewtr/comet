import Foundation

public struct AppSettings: Codable, Equatable, Sendable {
  public static let defaultRoomID = "global"

  public var webAppURL: String
  public var selectedRoomID: String
  public var overlaysEnabled: Bool

  public init(
    webAppURL: String = "",
    selectedRoomID: String = Self.defaultRoomID,
    overlaysEnabled: Bool = true
  ) {
    self.webAppURL = webAppURL
    self.selectedRoomID = selectedRoomID
    self.overlaysEnabled = overlaysEnabled
  }
}
