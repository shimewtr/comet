import Foundation

public enum PresentationTimerStatus: String, Equatable, Sendable {
  case stopped
  case running
  case paused
}

public enum PresentationTimerAttention: Equatable, Sendable {
  case normal
  case minuteWarning
  case expired
}

public struct PresentationTimerSnapshot: Equatable, Sendable {
  public let status: PresentationTimerStatus
  public let remainingSeconds: Int
  public let attention: PresentationTimerAttention

  public init(
    status: PresentationTimerStatus,
    remainingSeconds: Int,
    attention: PresentationTimerAttention
  ) {
    self.status = status
    self.remainingSeconds = remainingSeconds
    self.attention = attention
  }

  public var formattedRemainingTime: String {
    let hours = remainingSeconds / 3_600
    let minutes = (remainingSeconds % 3_600) / 60
    let seconds = remainingSeconds % 60
    if hours > 0 {
      return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }
    return String(format: "%02d:%02d", minutes, seconds)
  }
}

/// A wall-clock based countdown timer. Keeping the deadline instead of subtracting one on every
/// UI tick prevents drift when the app or run loop is briefly suspended.
public struct PresentationTimer: Equatable, Sendable {
  public static let defaultDurationSeconds = 10 * 60
  public static let maximumDurationSeconds = 24 * 60 * 60
  public static let warningThresholdSeconds = 5 * 60
  public static let warningDuration: TimeInterval = 3

  public private(set) var configuredDurationSeconds: Int
  public private(set) var remainingSeconds: Int
  public private(set) var status: PresentationTimerStatus = .stopped

  private var deadline: Date?
  private var warningUntil: Date?

  public init(durationSeconds: Int = Self.defaultDurationSeconds) {
    let duration = Self.clamped(durationSeconds)
    configuredDurationSeconds = duration
    remainingSeconds = duration
  }

  public mutating func start(at now: Date = Date()) {
    guard status != .running else { return }
    if remainingSeconds == 0 {
      remainingSeconds = configuredDurationSeconds
    }
    status = .running
    deadline = now.addingTimeInterval(TimeInterval(remainingSeconds))
    warningUntil = nil
  }

  public mutating func pause(at now: Date = Date()) {
    guard status == .running else { return }
    update(at: now)
    status = .paused
    deadline = nil
  }

  /// Stops the timer and restores the duration that was set while stopped.
  public mutating func stop() {
    status = .stopped
    remainingSeconds = configuredDurationSeconds
    deadline = nil
    warningUntil = nil
  }

  public mutating func adjust(by seconds: Int, at now: Date = Date()) {
    update(at: now)
    let previousRemainingSeconds = remainingSeconds
    remainingSeconds = Self.clamped(remainingSeconds + seconds)

    if status == .stopped {
      configuredDurationSeconds = remainingSeconds
    } else if status == .running {
      deadline = now.addingTimeInterval(TimeInterval(remainingSeconds))
    }

    if remainingSeconds >= Self.warningThresholdSeconds {
      warningUntil = nil
    }
    updateWarning(
      previousRemainingSeconds: previousRemainingSeconds,
      currentRemainingSeconds: remainingSeconds,
      at: now
    )
  }

  public mutating func update(at now: Date = Date()) {
    guard status == .running, let deadline else { return }
    let previousRemainingSeconds = remainingSeconds
    remainingSeconds = Self.clamped(Int(ceil(deadline.timeIntervalSince(now))))
    updateWarning(
      previousRemainingSeconds: previousRemainingSeconds,
      currentRemainingSeconds: remainingSeconds,
      at: now
    )
  }

  public func snapshot(at now: Date = Date()) -> PresentationTimerSnapshot {
    let attention: PresentationTimerAttention
    if remainingSeconds == 0 {
      attention = .expired
    } else if let warningUntil, now < warningUntil {
      attention = .minuteWarning
    } else {
      attention = .normal
    }
    return PresentationTimerSnapshot(
      status: status,
      remainingSeconds: remainingSeconds,
      attention: attention
    )
  }

  private mutating func updateWarning(
    previousRemainingSeconds: Int,
    currentRemainingSeconds: Int,
    at now: Date
  ) {
    guard currentRemainingSeconds > 0,
      currentRemainingSeconds < Self.warningThresholdSeconds,
      currentRemainingSeconds / 60 < previousRemainingSeconds / 60
    else { return }
    warningUntil = now.addingTimeInterval(Self.warningDuration)
  }

  private static func clamped(_ seconds: Int) -> Int {
    min(max(0, seconds), maximumDurationSeconds)
  }
}
