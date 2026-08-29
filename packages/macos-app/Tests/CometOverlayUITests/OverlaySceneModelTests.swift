import CometOverlayCore
import Testing

@testable import CometOverlayUI

@MainActor
@Test
func sceneModelBoundsCommentsAndStamps() {
  let model = OverlaySceneModel(commentCapacity: 2, stampCapacity: 1, laneCount: 2)

  model.show(comment: comment(id: "1"), now: 1)
  model.show(comment: comment(id: "2"), now: 1)
  model.show(comment: comment(id: "3"), now: 1)
  model.show(stamp: stamp(id: "1"))
  model.show(stamp: stamp(id: "2"))

  #expect(model.comments.map(\.comment.id) == ["2", "3"])
  #expect(model.stamps.map(\.message.id) == ["2"])

  model.removeAll()
  #expect(model.comments.isEmpty)
  #expect(model.stamps.isEmpty)
}

@MainActor
@Test
func sceneModelAssignsStableNormalizedStampPositions() {
  let model = OverlaySceneModel()
  let providedPosition = StampPosition(x: 0.25, y: 0.75)

  model.show(stamp: stamp(id: "random"))
  model.show(stamp: stamp(id: "provided", position: providedPosition))

  let randomPosition = model.stamps[0].position
  #expect((0.1...0.9).contains(randomPosition.x))
  #expect((0.1...0.9).contains(randomPosition.y))
  #expect(model.stamps[1].position == providedPosition)
}

private func comment(id: String) -> CometComment {
  CometComment(
    id: id,
    content: "comment \(id)",
    timestamp: 0,
    style: CommentStyle(color: "#ffffff", size: .medium)
  )
}

private func stamp(id: String, position: StampPosition? = nil) -> StampMessage {
  StampMessage(
    id: id,
    stamp: Stamp(id: id, name: "stamp", imageUrl: "", category: .reaction),
    timestamp: 0,
    position: position
  )
}
