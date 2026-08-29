import Foundation

public enum CometMessageType: String, Codable, CaseIterable, Sendable {
  case newComment = "new_comment"
  case newStamp = "new_stamp"
  case historyRequest = "history_request"
  case history
  case error
  case ping
  case pong
  case roomListRequest = "room_list_request"
  case roomList = "room_list"
  case createRoom = "create_room"
  case roomCreated = "room_created"
  case joinRoom = "join_room"
  case roomJoined = "room_joined"
}

public enum CommentSize: String, Codable, Sendable {
  case small
  case medium
  case large
}

public enum CommentAnimation: String, Codable, Sendable {
  case none
  case blink
  case bounce
  case shake
}

public struct CommentStyle: Codable, Equatable, Sendable {
  public var color: String
  public var size: CommentSize
  public var animation: CommentAnimation?
  public var speed: Double?

  public init(
    color: String,
    size: CommentSize,
    animation: CommentAnimation? = nil,
    speed: Double? = nil
  ) {
    self.color = color
    self.size = size
    self.animation = animation
    self.speed = speed
  }
}

public struct CometComment: Codable, Equatable, Sendable, Identifiable {
  public var id: String
  public var content: String
  public var timestamp: Int64
  public var userId: String?
  public var style: CommentStyle

  public init(
    id: String,
    content: String,
    timestamp: Int64,
    userId: String? = nil,
    style: CommentStyle
  ) {
    self.id = id
    self.content = content
    self.timestamp = timestamp
    self.userId = userId
    self.style = style
  }
}

public enum StampCategory: String, Codable, Sendable {
  case emotion
  case reaction
  case custom
}

public struct Stamp: Codable, Equatable, Sendable, Identifiable {
  public var id: String
  public var name: String
  public var imageUrl: String
  public var category: StampCategory

  public init(id: String, name: String, imageUrl: String, category: StampCategory) {
    self.id = id
    self.name = name
    self.imageUrl = imageUrl
    self.category = category
  }
}

public struct StampPosition: Codable, Equatable, Sendable {
  public var x: Double
  public var y: Double

  public init(x: Double, y: Double) {
    self.x = x
    self.y = y
  }
}

public struct StampMessage: Codable, Equatable, Sendable, Identifiable {
  public var id: String
  public var stamp: Stamp
  public var timestamp: Int64
  public var userId: String?
  public var position: StampPosition?

  public init(
    id: String,
    stamp: Stamp,
    timestamp: Int64,
    userId: String? = nil,
    position: StampPosition? = nil
  ) {
    self.id = id
    self.stamp = stamp
    self.timestamp = timestamp
    self.userId = userId
    self.position = position
  }
}

public struct CometRoom: Codable, Equatable, Sendable, Identifiable {
  public static let global = CometRoom(
    id: "global",
    name: "グローバル",
    createdAt: 0,
    lastActiveAt: 0,
    expiresAt: nil
  )

  public var id: String
  public var name: String
  public var createdAt: Int64
  public var lastActiveAt: Int64
  public var expiresAt: Int64?

  public init(
    id: String,
    name: String,
    createdAt: Int64,
    lastActiveAt: Int64,
    expiresAt: Int64?
  ) {
    self.id = id
    self.name = name
    self.createdAt = createdAt
    self.lastActiveAt = lastActiveAt
    self.expiresAt = expiresAt
  }
}

public struct EmptyPayload: Codable, Equatable, Sendable {
  public init() {}
}

public struct NewCommentPayload: Codable, Equatable, Sendable {
  public var comment: CometComment
}

public struct NewStampPayload: Codable, Equatable, Sendable {
  public var stamp: StampMessage
}

public struct HistoryPayload: Codable, Equatable, Sendable {
  public var comments: [CometComment]
}

public struct RoomListPayload: Codable, Equatable, Sendable {
  public var rooms: [CometRoom]
}

public struct RoomCreatedPayload: Codable, Equatable, Sendable {
  public var room: CometRoom
}

public struct JoinRoomPayload: Codable, Equatable, Sendable {
  public var roomId: String

  public init(roomId: String) {
    self.roomId = roomId
  }
}

public struct RoomJoinedPayload: Codable, Equatable, Sendable {
  public var room: CometRoom
}

public enum WebSocketErrorCode: String, Codable, Sendable {
  case invalidRoomName = "INVALID_ROOM_NAME"
  case roomNotFound = "ROOM_NOT_FOUND"
  case roomExpired = "ROOM_EXPIRED"
  case invalidMessage = "INVALID_MESSAGE"
}

public struct ErrorPayload: Codable, Equatable, Sendable {
  public var code: WebSocketErrorCode
  public var message: String
  public var fallbackRoom: CometRoom?
}

public struct WebSocketEnvelope<Payload: Codable & Sendable>: Codable, Sendable {
  public var type: CometMessageType
  public var payload: Payload
  public var timestamp: Int64
  public var roomId: String?

  public init(
    type: CometMessageType,
    payload: Payload,
    timestamp: Int64,
    roomId: String? = nil
  ) {
    self.type = type
    self.payload = payload
    self.timestamp = timestamp
    self.roomId = roomId
  }
}

public enum CometServerEvent: Equatable, Sendable {
  case comment(CometComment, roomID: String?)
  case stamp(StampMessage, roomID: String?)
  case history([CometComment], roomID: String?)
  case rooms([CometRoom])
  case roomCreated(CometRoom)
  case roomJoined(CometRoom)
  case serverError(ErrorPayload)
  case ping
  case pong
  case unsupported(CometMessageType)
}

public enum CometClientEvent: Equatable, Sendable {
  case connectionState(ConnectionState)
  case message(CometServerEvent)
}
