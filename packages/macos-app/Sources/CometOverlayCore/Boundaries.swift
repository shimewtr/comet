import Foundation

public struct RuntimeConfiguration: Codable, Equatable, Sendable {
  public var websocketURL: URL
  public var historyAPIURL: URL?
  public var authEnabled: Bool

  public init(
    websocketURL: URL,
    historyAPIURL: URL? = nil,
    authEnabled: Bool = false
  ) {
    self.websocketURL = websocketURL
    self.historyAPIURL = historyAPIURL
    self.authEnabled = authEnabled
  }
}

public protocol RuntimeConfigurationProviding: Sendable {
  func configuration(for webAppURL: URL) async throws -> RuntimeConfiguration
}

public protocol MessageStreaming: Sendable {
  func connect(configuration: RuntimeConfiguration, roomID: String) async throws
  func disconnect() async
}

@MainActor
public protocol OverlayPresenting: AnyObject {
  func setEnabled(_ enabled: Bool)
}
