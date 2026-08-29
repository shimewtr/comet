import Foundation

public typealias WebSocketTransportFactory = @Sendable () -> any WebSocketTransport
public typealias ReconnectSleeper = @Sendable (UInt64) async throws -> Void

public actor CometWebSocketClient: MessageStreaming {
  public nonisolated let events: AsyncStream<CometClientEvent>

  private let eventContinuation: AsyncStream<CometClientEvent>.Continuation
  private let transportFactory: WebSocketTransportFactory
  private let reconnectPolicy: ReconnectPolicy
  private let reconnectSleeper: ReconnectSleeper
  private let keepaliveIntervalMilliseconds: UInt64
  private let codec: CometProtocolCodec

  private var transport: (any WebSocketTransport)?
  private var receiveTask: Task<Void, Never>?
  private var keepaliveTask: Task<Void, Never>?
  private var configuration: RuntimeConfiguration?
  private var requestedRoomID = AppSettings.defaultRoomID
  private var manuallyDisconnected = true

  public init(
    transportFactory: @escaping WebSocketTransportFactory = {
      URLSessionWebSocketTransport()
    },
    reconnectPolicy: ReconnectPolicy = ReconnectPolicy(),
    keepaliveIntervalMilliseconds: UInt64 = 5 * 60 * 1_000,
    reconnectSleeper: @escaping ReconnectSleeper = { milliseconds in
      try await Task.sleep(for: .milliseconds(milliseconds))
    },
    codec: CometProtocolCodec = CometProtocolCodec()
  ) {
    let stream = AsyncStream.makeStream(of: CometClientEvent.self)
    events = stream.stream
    eventContinuation = stream.continuation
    self.transportFactory = transportFactory
    self.reconnectPolicy = reconnectPolicy
    self.keepaliveIntervalMilliseconds = keepaliveIntervalMilliseconds
    self.reconnectSleeper = reconnectSleeper
    self.codec = codec
  }

  deinit {
    eventContinuation.finish()
  }

  public func connect(configuration: RuntimeConfiguration, roomID: String) async throws {
    await stopActiveTransport(emitDisconnected: false)
    self.configuration = configuration
    requestedRoomID = roomID
    manuallyDisconnected = false
    eventContinuation.yield(.connectionState(.connecting))

    do {
      try await openTransport()
      startBackgroundTasks()
    } catch {
      eventContinuation.yield(.connectionState(.failed(message: error.localizedDescription)))
      throw error
    }
  }

  public func disconnect() async {
    manuallyDisconnected = true
    configuration = nil
    await stopActiveTransport(emitDisconnected: true)
  }

  public func requestRooms() async throws {
    try await send(type: .roomListRequest, payload: EmptyPayload())
  }

  public func joinRoom(_ roomID: String) async throws {
    requestedRoomID = roomID
    try await send(type: .joinRoom, payload: JoinRoomPayload(roomId: roomID))
  }

  private func openTransport() async throws {
    guard let configuration else { throw WebSocketTransportError.notConnected }
    let nextTransport = transportFactory()
    do {
      try await nextTransport.connect(to: configuration.websocketURL)
      transport = nextTransport
      try await sendInitialRequests(using: nextTransport)
      eventContinuation.yield(.connectionState(.connected))
    } catch {
      await nextTransport.close()
      transport = nil
      throw error
    }
  }

  private func sendInitialRequests(using transport: any WebSocketTransport) async throws {
    try await transport.send(
      codec.encode(type: .roomListRequest, payload: EmptyPayload())
    )
    try await transport.send(
      codec.encode(type: .joinRoom, payload: JoinRoomPayload(roomId: requestedRoomID))
    )
  }

  private func startBackgroundTasks() {
    receiveTask?.cancel()
    receiveTask = Task { await receiveMessages() }
    startKeepalive()
  }

  private func receiveMessages() async {
    while !Task.isCancelled && !manuallyDisconnected {
      guard let activeTransport = transport else { return }
      do {
        let data = try await activeTransport.receive()
        try await handle(codec.decode(data))
      } catch is CancellationError {
        return
      } catch {
        guard !manuallyDisconnected, !Task.isCancelled else { return }
        await activeTransport.close()
        transport = nil
        keepaliveTask?.cancel()
        keepaliveTask = nil
        guard await reconnect(after: error) else { return }
      }
    }
  }

  private func reconnect(after error: Error) async -> Bool {
    guard reconnectPolicy.maximumAttempts > 0 else {
      eventContinuation.yield(.connectionState(.failed(message: error.localizedDescription)))
      return false
    }

    for attempt in 1...reconnectPolicy.maximumAttempts {
      guard !manuallyDisconnected, !Task.isCancelled else { return false }
      eventContinuation.yield(.connectionState(.connecting))
      do {
        try await reconnectSleeper(reconnectPolicy.delayMilliseconds(forAttempt: attempt))
        try await openTransport()
        startKeepalive()
        return true
      } catch is CancellationError {
        return false
      } catch {
        if attempt == reconnectPolicy.maximumAttempts {
          eventContinuation.yield(
            .connectionState(.failed(message: error.localizedDescription))
          )
        }
      }
    }
    return false
  }

  private func startKeepalive() {
    keepaliveTask?.cancel()
    guard keepaliveIntervalMilliseconds > 0 else { return }
    let interval = keepaliveIntervalMilliseconds
    keepaliveTask = Task { [weak self] in
      while !Task.isCancelled {
        do {
          try await Task.sleep(for: .milliseconds(interval))
          guard !Task.isCancelled else { return }
          try await self?.send(type: .ping, payload: EmptyPayload())
        } catch {
          return
        }
      }
    }
  }

  private func handle(_ event: CometServerEvent) async throws {
    switch event {
    case .roomJoined(let room):
      requestedRoomID = room.id
      try await send(type: .historyRequest, payload: EmptyPayload())
    case .serverError(let payload):
      if let fallbackRoom = payload.fallbackRoom {
        requestedRoomID = fallbackRoom.id
        try await send(type: .historyRequest, payload: EmptyPayload())
      }
    case .ping:
      try await send(type: .pong, payload: EmptyPayload())
    default:
      break
    }
    eventContinuation.yield(.message(event))
  }

  private func send<Payload: Codable & Sendable>(
    type: CometMessageType,
    payload: Payload
  ) async throws {
    guard let transport else { throw WebSocketTransportError.notConnected }
    try await transport.send(codec.encode(type: type, payload: payload))
  }

  private func stopActiveTransport(emitDisconnected: Bool) async {
    receiveTask?.cancel()
    receiveTask = nil
    keepaliveTask?.cancel()
    keepaliveTask = nil
    if let transport {
      await transport.close()
      self.transport = nil
    }
    if emitDisconnected {
      eventContinuation.yield(.connectionState(.disconnected))
    }
  }
}
