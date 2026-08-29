import Testing

@testable import CometOverlayCore

private struct RenderValue: Identifiable, Sendable {
  let id: Int
}

@Test
func boundedRenderQueueEvictsOldestItems() {
  var queue = BoundedRenderQueue<RenderValue>(capacity: 2)

  #expect(queue.append(RenderValue(id: 1)) == nil)
  #expect(queue.append(RenderValue(id: 2)) == nil)
  #expect(queue.append(RenderValue(id: 3))?.id == 1)
  #expect(queue.elements.map(\.id) == [2, 3])

  queue.remove(id: 2)
  #expect(queue.elements.map(\.id) == [3])
}

@Test
func laneAllocatorUsesFreeLanesBeforeDelaying() {
  var allocator = CommentLaneAllocator(laneCount: 2)

  #expect(allocator.reserve(at: 10, animationDuration: 5) == LaneReservation(lane: 0, delay: 0))
  #expect(allocator.reserve(at: 10, animationDuration: 5) == LaneReservation(lane: 1, delay: 0))
  #expect(allocator.reserve(at: 10, animationDuration: 5) == LaneReservation(lane: 0, delay: 1))
}

@Test
func displaySettingsClampChromeExtensionCompatibleRanges() {
  let settings = OverlayDisplaySettings(
    speedScale: 10,
    sizeScale: 0,
    commentOpacity: 0,
    stampOpacity: 2,
    displayArea: .topThird
  )

  #expect(settings.speedScale == 2)
  #expect(settings.sizeScale == 0.5)
  #expect(settings.commentOpacity == 0.2)
  #expect(settings.stampOpacity == 1)
  #expect(settings.displayArea.heightFraction == 1.0 / 3.0)
}
