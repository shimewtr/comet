import Foundation

public enum CommentPlacement: String, Codable, CaseIterable, Sendable {
  case scrolling
  case fixedTop
  case fixedBottom
}

public enum OverlayDisplayArea: String, Codable, CaseIterable, Sendable {
  case full
  case topHalf
  case topThird

  public var heightFraction: Double {
    switch self {
    case .full:
      1
    case .topHalf:
      0.5
    case .topThird:
      1 / 3
    }
  }
}

public struct OverlayDisplaySettings: Codable, Equatable, Sendable {
  public var speedScale: Double
  public var sizeScale: Double
  public var commentOpacity: Double
  public var stampOpacity: Double
  public var displayArea: OverlayDisplayArea

  public init(
    speedScale: Double = 1,
    sizeScale: Double = 1,
    commentOpacity: Double = 1,
    stampOpacity: Double = 1,
    displayArea: OverlayDisplayArea = .full
  ) {
    self.speedScale = speedScale.clamped(to: 0.5...2)
    self.sizeScale = sizeScale.clamped(to: 0.5...2)
    self.commentOpacity = commentOpacity.clamped(to: 0.2...1)
    self.stampOpacity = stampOpacity.clamped(to: 0.2...1)
    self.displayArea = displayArea
  }

  private enum CodingKeys: String, CodingKey {
    case speedScale
    case sizeScale
    case commentOpacity
    case stampOpacity
    case displayArea
  }

  public init(from decoder: any Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.init(
      speedScale: try container.decodeIfPresent(Double.self, forKey: .speedScale) ?? 1,
      sizeScale: try container.decodeIfPresent(Double.self, forKey: .sizeScale) ?? 1,
      commentOpacity: try container.decodeIfPresent(Double.self, forKey: .commentOpacity) ?? 1,
      stampOpacity: try container.decodeIfPresent(Double.self, forKey: .stampOpacity) ?? 1,
      displayArea:
        try container.decodeIfPresent(OverlayDisplayArea.self, forKey: .displayArea) ?? .full
    )
  }
}

public struct OverlayDisplayDescriptor: Identifiable, Equatable, Sendable {
  public let id: String
  public let name: String

  public init(id: String, name: String) {
    self.id = id
    self.name = name
  }
}

public struct OverlayPresentationConfiguration: Equatable, Sendable {
  public var isEnabled: Bool
  public var selectedDisplayID: String?
  public var displaySettings: OverlayDisplaySettings

  public init(
    isEnabled: Bool,
    selectedDisplayID: String?,
    displaySettings: OverlayDisplaySettings
  ) {
    self.isEnabled = isEnabled
    self.selectedDisplayID = selectedDisplayID
    self.displaySettings = displaySettings
  }
}

public enum DisplaySelectionResolver {
  public static func visibleDisplayIDs(
    selectedDisplayID: String?,
    availableDisplayIDs: Set<String>,
    mainDisplayID: String?
  ) -> Set<String> {
    guard let selectedDisplayID else { return availableDisplayIDs }
    if availableDisplayIDs.contains(selectedDisplayID) {
      return [selectedDisplayID]
    }
    if let mainDisplayID, availableDisplayIDs.contains(mainDisplayID) {
      return [mainDisplayID]
    }
    return []
  }
}

public struct LaneReservation: Equatable, Sendable {
  public let lane: Int
  public let delay: TimeInterval

  public init(lane: Int, delay: TimeInterval) {
    self.lane = lane
    self.delay = delay
  }
}

public struct StampComboTracker: Sendable {
  public static let window: TimeInterval = 2
  public static let burstInterval = 5

  private struct State: Sendable {
    var count: Int
    var lastSeenAt: TimeInterval
  }

  private var states: [String: State] = [:]

  public init() {}

  public mutating func register(stampKey: String, at time: TimeInterval) -> Int? {
    let previous = states[stampKey]
    let count = previous.map { time - $0.lastSeenAt <= Self.window ? $0.count + 1 : 1 } ?? 1
    states[stampKey] = State(count: count, lastSeenAt: time)
    return count >= Self.burstInterval && count % Self.burstInterval == 0 ? count : nil
  }

  public mutating func reset() {
    states.removeAll(keepingCapacity: true)
  }
}

public struct CommentLaneAllocator: Sendable {
  public let laneCount: Int
  private var availableAt: [TimeInterval]

  public init(laneCount: Int) {
    self.laneCount = max(1, laneCount)
    availableAt = Array(repeating: 0, count: max(1, laneCount))
  }

  public mutating func reserve(
    at time: TimeInterval,
    animationDuration: TimeInterval
  ) -> LaneReservation {
    let lane =
      availableAt.enumerated().min { left, right in
        left.element < right.element
      }?.offset ?? 0
    let startTime = max(time, availableAt[lane])
    let releaseDelay = max(0.25, animationDuration * 0.2)
    availableAt[lane] = startTime + releaseDelay
    return LaneReservation(lane: lane, delay: startTime - time)
  }

  public mutating func reset() {
    availableAt = Array(repeating: 0, count: laneCount)
  }
}

public struct BoundedRenderQueue<Element: Identifiable & Sendable>: Sendable
where Element.ID: Equatable & Sendable {
  public let capacity: Int
  public private(set) var elements: [Element] = []

  public init(capacity: Int) {
    self.capacity = max(1, capacity)
  }

  @discardableResult
  public mutating func append(_ element: Element) -> Element? {
    elements.append(element)
    guard elements.count > capacity else { return nil }
    return elements.removeFirst()
  }

  public mutating func remove(id: Element.ID) {
    elements.removeAll { $0.id == id }
  }

  public mutating func removeAll() {
    elements.removeAll(keepingCapacity: true)
  }
}

extension Comparable {
  fileprivate func clamped(to range: ClosedRange<Self>) -> Self {
    min(max(self, range.lowerBound), range.upperBound)
  }
}
