import Foundation

public enum WebSocketTransportError: Error, Equatable, Sendable {
  case notConnected
  case unsupportedMessage
}

public protocol WebSocketTransport: Sendable {
  func connect(to url: URL) async throws
  func send(_ data: Data) async throws
  func receive() async throws -> Data
  func close() async
}

public actor URLSessionWebSocketTransport: WebSocketTransport {
  private let session: URLSession
  private var task: URLSessionWebSocketTask?

  public init(session: URLSession = .shared) {
    self.session = session
  }

  public func connect(to url: URL) async throws {
    await close()
    let task = session.webSocketTask(with: url)
    self.task = task
    task.resume()
  }

  public func send(_ data: Data) async throws {
    guard let task else { throw WebSocketTransportError.notConnected }
    try await task.send(.data(data))
  }

  public func receive() async throws -> Data {
    guard let task else { throw WebSocketTransportError.notConnected }
    switch try await task.receive() {
    case .data(let data):
      return data
    case .string(let value):
      guard let data = value.data(using: .utf8) else {
        throw WebSocketTransportError.unsupportedMessage
      }
      return data
    @unknown default:
      throw WebSocketTransportError.unsupportedMessage
    }
  }

  public func close() async {
    task?.cancel(with: .normalClosure, reason: nil)
    task = nil
  }
}
