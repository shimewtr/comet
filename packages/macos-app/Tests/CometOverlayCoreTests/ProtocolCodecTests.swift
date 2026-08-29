import Foundation
import Testing

@testable import CometOverlayCore

func protocolFixture(named name: String) throws -> Data {
  let packageDirectory = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent()
    .deletingLastPathComponent()
    .deletingLastPathComponent()
  let fixtureURL =
    packageDirectory
    .deletingLastPathComponent()
    .appendingPathComponent("shared/fixtures/websocket-events.json")
  let data = try Data(contentsOf: fixtureURL)
  let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
  return try JSONSerialization.data(withJSONObject: try #require(object[name]))
}

@Test
func decodesSharedCommentAndStampFixtures() throws {
  let codec = CometProtocolCodec()

  switch try codec.decode(protocolFixture(named: "comment")) {
  case .comment(let comment, let roomID):
    #expect(comment.id == "comment-1")
    #expect(comment.content == "Hello from Comet")
    #expect(comment.style.size == .large)
    #expect(comment.style.animation == .bounce)
    #expect(roomID == "room-1")
  default:
    Issue.record("Expected a comment event")
  }

  switch try codec.decode(protocolFixture(named: "stamp")) {
  case .stamp(let message, let roomID):
    #expect(message.stamp.id == "stamp-1")
    #expect(message.stamp.category == .reaction)
    #expect(message.position == StampPosition(x: 0.25, y: 0.75))
    #expect(roomID == "room-1")
  default:
    Issue.record("Expected a stamp event")
  }
}

@Test
func decodesSharedRoomAndErrorFixtures() throws {
  let codec = CometProtocolCodec()

  switch try codec.decode(protocolFixture(named: "roomList")) {
  case .rooms(let rooms):
    #expect(rooms.map(\.id) == ["global", "room-1"])
    #expect(rooms[0].expiresAt == nil)
  default:
    Issue.record("Expected a room list event")
  }

  switch try codec.decode(protocolFixture(named: "error")) {
  case .serverError(let payload):
    #expect(payload.code == .roomNotFound)
    #expect(payload.fallbackRoom?.id == "global")
  default:
    Issue.record("Expected a server error event")
  }
}

@Test
func encodesJoinRoomRequestUsingTypeScriptFieldNames() throws {
  let data = try CometProtocolCodec().encode(
    type: .joinRoom,
    payload: JoinRoomPayload(roomId: "room-1"),
    timestamp: 123
  )
  let object = try #require(JSONSerialization.jsonObject(with: data) as? [String: Any])
  let payload = try #require(object["payload"] as? [String: Any])

  #expect(object["type"] as? String == "join_room")
  #expect(object["timestamp"] as? Int == 123)
  #expect(payload["roomId"] as? String == "room-1")
}
