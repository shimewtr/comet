import Foundation

public enum ProtocolCodecError: Error, Equatable, Sendable {
  case unexpectedMessageType(expected: CometMessageType, actual: CometMessageType)
}

public struct CometProtocolCodec: Sendable {
  private struct MessageHeader: Decodable {
    let type: CometMessageType
  }

  public init() {}

  public func decode(_ data: Data) throws -> CometServerEvent {
    let decoder = JSONDecoder()
    let header = try decoder.decode(MessageHeader.self, from: data)

    switch header.type {
    case .newComment:
      let envelope = try decodeEnvelope(NewCommentPayload.self, from: data, expected: header.type)
      return .comment(envelope.payload.comment, roomID: envelope.roomId)
    case .newStamp:
      let envelope = try decodeEnvelope(NewStampPayload.self, from: data, expected: header.type)
      return .stamp(envelope.payload.stamp, roomID: envelope.roomId)
    case .history:
      let envelope = try decodeEnvelope(HistoryPayload.self, from: data, expected: header.type)
      return .history(envelope.payload.comments, roomID: envelope.roomId)
    case .roomList:
      let envelope = try decodeEnvelope(RoomListPayload.self, from: data, expected: header.type)
      return .rooms(envelope.payload.rooms)
    case .roomCreated:
      let envelope = try decodeEnvelope(RoomCreatedPayload.self, from: data, expected: header.type)
      return .roomCreated(envelope.payload.room)
    case .roomJoined:
      let envelope = try decodeEnvelope(RoomJoinedPayload.self, from: data, expected: header.type)
      return .roomJoined(envelope.payload.room)
    case .error:
      let envelope = try decodeEnvelope(ErrorPayload.self, from: data, expected: header.type)
      return .serverError(envelope.payload)
    case .ping:
      return .ping
    case .pong:
      return .pong
    case .historyRequest, .roomListRequest, .createRoom, .joinRoom:
      return .unsupported(header.type)
    }
  }

  public func encode<Payload: Codable & Sendable>(
    type: CometMessageType,
    payload: Payload,
    timestamp: Int64 = Int64(Date().timeIntervalSince1970 * 1_000)
  ) throws -> Data {
    try JSONEncoder().encode(
      WebSocketEnvelope(type: type, payload: payload, timestamp: timestamp)
    )
  }

  private func decodeEnvelope<Payload: Codable & Sendable>(
    _ payloadType: Payload.Type,
    from data: Data,
    expected: CometMessageType
  ) throws -> WebSocketEnvelope<Payload> {
    let envelope = try JSONDecoder().decode(WebSocketEnvelope<Payload>.self, from: data)
    guard envelope.type == expected else {
      throw ProtocolCodecError.unexpectedMessageType(
        expected: expected,
        actual: envelope.type
      )
    }
    return envelope
  }
}
