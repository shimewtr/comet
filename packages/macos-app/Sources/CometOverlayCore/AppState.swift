import Foundation

public enum ConnectionState: Equatable, Sendable {
  case disconnected
  case connecting
  case connected
  case failed(message: String)
}

public struct AppState: Equatable, Sendable {
  public var settings: AppSettings
  public var connectionState: ConnectionState

  public init(
    settings: AppSettings = AppSettings(),
    connectionState: ConnectionState = .disconnected
  ) {
    self.settings = settings
    self.connectionState = connectionState
  }
}
