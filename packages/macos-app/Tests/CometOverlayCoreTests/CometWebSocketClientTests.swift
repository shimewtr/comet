import Foundation
import Testing

@testable import CometOverlayCore

private enum MockTransportError: Error, Sendable {
  case connectionClosed
}

private enum MockIncomingMessage: Sendable {
  case data(Data)
  case failure(MockTransportError)
}

private actor MockWebSocketTransport: WebSocketTransport {
  private var incoming: [MockIncomingMessage] = []
  private var receiveContinuation: CheckedContinuation<Data, Error>?
  private var connectFailuresRemaining = 0
  private(set) var connectedURLs: [URL] = []
  private(set) var sentMessages: [Data] = []

  func connect(to url: URL) async throws {
    connectedURLs.append(url)
    if connectFailuresRemaining > 0 {
      connectFailuresRemaining -= 1
      throw MockTransportError.connectionClosed
    }
  }

  func send(_ data: Data) async throws {
    sentMessages.append(data)
  }

  func receive() async throws -> Data {
    if !incoming.isEmpty {
      return try value(from: incoming.removeFirst())
    }
    return try await withCheckedThrowingContinuation { continuation in
      receiveContinuation = continuation
    }
  }

  func close() async {
    receiveContinuation?.resume(throwing: CancellationError())
    receiveContinuation = nil
  }

  func enqueue(_ message: MockIncomingMessage) {
    if let continuation = receiveContinuation {
      receiveContinuation = nil
      resume(continuation, with: message)
    } else {
      incoming.append(message)
    }
  }

  func failNextConnections(_ count: Int) {
    connectFailuresRemaining = max(0, count)
  }

  func waitForSentMessageCount(_ count: Int) async -> [Data] {
    for _ in 0..<100 where sentMessages.count < count {
      await Task.yield()
    }
    return sentMessages
  }

  func waitForConnectionCount(_ count: Int) async -> [URL] {
    for _ in 0..<100 where connectedURLs.count < count {
      await Task.yield()
    }
    return connectedURLs
  }

  private func value(from message: MockIncomingMessage) throws -> Data {
    switch message {
    case .data(let data):
      data
    case .failure(let error):
      throw error
    }
  }

  private func resume(
    _ continuation: CheckedContinuation<Data, Error>,
    with message: MockIncomingMessage
  ) {
    switch message {
    case .data(let data):
      continuation.resume(returning: data)
    case .failure(let error):
      continuation.resume(throwing: error)
    }
  }
}

private func messageType(in data: Data) throws -> String {
  let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
  return try #require(object["type"] as? String)
}

@Test
func connectsAndSendsRoomBootstrapMessages() async throws {
  let transport = MockWebSocketTransport()
  let client = CometWebSocketClient(
    transportFactory: { transport },
    keepaliveIntervalMilliseconds: 0
  )
  let configuration = RuntimeConfiguration(
    websocketURL: try #require(URL(string: "wss://socket.example.com/dev"))
  )

  try await client.connect(configuration: configuration, roomID: "room-1")
  let messages = await transport.sentMessages
  let connectedURLs = await transport.connectedURLs

  #expect(connectedURLs == [configuration.websocketURL])
  #expect(try messages.map(messageType) == ["room_list_request", "join_room"])

  await client.disconnect()
}

@Test
func initialConnectionKeepsRetryingUntilTheNetworkRecovers() async throws {
  let transport = MockWebSocketTransport()
  await transport.failNextConnections(2)
  let client = CometWebSocketClient(
    transportFactory: { transport },
    reconnectPolicy: ReconnectPolicy(
      baseDelayMilliseconds: 0,
      maximumDelayMilliseconds: 0
    ),
    keepaliveIntervalMilliseconds: 0,
    reconnectSleeper: { _ in }
  )
  let configuration = RuntimeConfiguration(
    websocketURL: try #require(URL(string: "wss://socket.example.com/dev"))
  )

  try await client.connect(configuration: configuration, roomID: "room-1")
  let connectionCount = await transport.connectedURLs.count
  let sentMessageCount = await transport.sentMessages.count

  #expect(connectionCount == 3)
  #expect(sentMessageCount == 2)

  await client.disconnect()
}

@Test
func roomJoinRequestsHistoryAndPublishesEvent() async throws {
  let transport = MockWebSocketTransport()
  let client = CometWebSocketClient(
    transportFactory: { transport },
    keepaliveIntervalMilliseconds: 0
  )
  var events = client.events.makeAsyncIterator()
  let configuration = RuntimeConfiguration(
    websocketURL: try #require(URL(string: "wss://socket.example.com/dev"))
  )

  try await client.connect(configuration: configuration, roomID: "room-1")
  _ = await events.next()
  _ = await events.next()
  await transport.enqueue(.data(try protocolFixture(named: "roomJoined")))

  let event = await events.next()
  #expect(
    event
      == .message(
        .roomJoined(
          CometRoom(
            id: "room-1",
            name: "Demo",
            createdAt: 1_735_689_500_000,
            lastActiveAt: 1_735_689_600_000,
            expiresAt: 1_735_776_000_000
          ))))
  let messages = await transport.waitForSentMessageCount(3)
  #expect(try messages.map(messageType).last == "history_request")

  await client.disconnect()
}

@Test
func reconnectsAfterUnexpectedTransportClosure() async throws {
  let transport = MockWebSocketTransport()
  let client = CometWebSocketClient(
    transportFactory: { transport },
    reconnectPolicy: ReconnectPolicy(maximumAttempts: 1, baseDelayMilliseconds: 0),
    keepaliveIntervalMilliseconds: 0,
    reconnectSleeper: { _ in }
  )
  let configuration = RuntimeConfiguration(
    websocketURL: try #require(URL(string: "wss://socket.example.com/dev"))
  )

  try await client.connect(configuration: configuration, roomID: "global")
  await transport.enqueue(.failure(MockTransportError.connectionClosed))
  let connections = await transport.waitForConnectionCount(2)
  let sentMessageCount = await transport.waitForSentMessageCount(4).count

  #expect(connections.count == 2)
  #expect(sentMessageCount == 4)

  await client.disconnect()
}

@Test
func keepsReconnectingBeyondFiveFailuresUntilTheNetworkRecovers() async throws {
  let transport = MockWebSocketTransport()
  let client = CometWebSocketClient(
    transportFactory: { transport },
    reconnectPolicy: ReconnectPolicy(
      baseDelayMilliseconds: 0,
      maximumDelayMilliseconds: 0
    ),
    keepaliveIntervalMilliseconds: 0,
    reconnectSleeper: { _ in }
  )
  let configuration = RuntimeConfiguration(
    websocketURL: try #require(URL(string: "wss://socket.example.com/dev"))
  )

  try await client.connect(configuration: configuration, roomID: "global")
  await transport.failNextConnections(6)
  await transport.enqueue(.failure(MockTransportError.connectionClosed))
  let connections = await transport.waitForConnectionCount(8)
  let sentMessageCount = await transport.waitForSentMessageCount(4).count

  #expect(connections.count == 8)
  #expect(sentMessageCount == 4)

  await client.disconnect()
}
