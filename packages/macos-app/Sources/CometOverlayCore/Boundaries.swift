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
  var events: AsyncStream<CometClientEvent> { get }

  func connect(configuration: RuntimeConfiguration, roomID: String) async throws
  func disconnect() async
  func requestRooms() async throws
  func joinRoom(_ roomID: String) async throws
}

@MainActor
public protocol OverlayPresenting: AnyObject {
  var availableDisplays: [OverlayDisplayDescriptor] { get }

  func apply(configuration: OverlayPresentationConfiguration)
  func show(comment: CometComment, placement: CommentPlacement)
  func show(stamp: StampMessage)
}
