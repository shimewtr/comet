import Combine
import CometOverlayCore
import Foundation

public struct RenderedComment: Identifiable, Sendable {
  public let id: UUID
  public let comment: CometComment
  public let placement: CommentPlacement
  public let lane: Int
  public let delay: TimeInterval
  public let duration: TimeInterval
}

public struct RenderedStamp: Identifiable, Sendable {
  public let id: UUID
  public let message: StampMessage
}

@MainActor
public final class OverlaySceneModel: ObservableObject {
  @Published public private(set) var comments: [RenderedComment] = []
  @Published public private(set) var stamps: [RenderedStamp] = []
  @Published public var displaySettings: OverlayDisplaySettings

  private var commentQueue: BoundedRenderQueue<RenderedComment>
  private var stampQueue: BoundedRenderQueue<RenderedStamp>
  private var laneAllocator: CommentLaneAllocator
  private var removalTasks: [UUID: Task<Void, Never>] = [:]

  public init(
    displaySettings: OverlayDisplaySettings = OverlayDisplaySettings(),
    commentCapacity: Int = 100,
    stampCapacity: Int = 60,
    laneCount: Int = 8
  ) {
    self.displaySettings = displaySettings
    commentQueue = BoundedRenderQueue(capacity: commentCapacity)
    stampQueue = BoundedRenderQueue(capacity: stampCapacity)
    laneAllocator = CommentLaneAllocator(laneCount: laneCount)
  }

  public func show(
    comment: CometComment,
    placement: CommentPlacement = .scrolling,
    now: TimeInterval = ProcessInfo.processInfo.systemUptime
  ) {
    let duration = commentDuration(for: comment)
    let reservation = laneAllocator.reserve(at: now, animationDuration: duration)
    let item = RenderedComment(
      id: UUID(),
      comment: comment,
      placement: placement,
      lane: reservation.lane,
      delay: reservation.delay,
      duration: placement == .scrolling ? duration : 4
    )
    if let removed = commentQueue.append(item) {
      removalTasks.removeValue(forKey: removed.id)?.cancel()
    }
    comments = commentQueue.elements
    scheduleRemoval(ofComment: item)
  }

  public func show(stamp message: StampMessage) {
    let item = RenderedStamp(id: UUID(), message: message)
    if let removed = stampQueue.append(item) {
      removalTasks.removeValue(forKey: removed.id)?.cancel()
    }
    stamps = stampQueue.elements
    scheduleRemoval(ofStamp: item)
  }

  public func removeAll() {
    for task in removalTasks.values {
      task.cancel()
    }
    removalTasks.removeAll()
    commentQueue.removeAll()
    stampQueue.removeAll()
    laneAllocator.reset()
    comments = []
    stamps = []
  }

  private func commentDuration(for comment: CometComment) -> TimeInterval {
    let speed = max(1, comment.style.speed ?? 5) * displaySettings.speedScale
    return max(2, 12 / speed * 5)
  }

  private func scheduleRemoval(ofComment item: RenderedComment) {
    removalTasks[item.id] = Task { [weak self] in
      try? await Task.sleep(for: .seconds(item.delay + item.duration + 0.5))
      guard !Task.isCancelled else { return }
      self?.commentQueue.remove(id: item.id)
      self?.comments = self?.commentQueue.elements ?? []
      self?.removalTasks.removeValue(forKey: item.id)
    }
  }

  private func scheduleRemoval(ofStamp item: RenderedStamp) {
    removalTasks[item.id] = Task { [weak self] in
      try? await Task.sleep(for: .seconds(3))
      guard !Task.isCancelled else { return }
      self?.stampQueue.remove(id: item.id)
      self?.stamps = self?.stampQueue.elements ?? []
      self?.removalTasks.removeValue(forKey: item.id)
    }
  }
}
