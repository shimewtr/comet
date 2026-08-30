import Foundation

public struct ReconnectPolicy: Equatable, Sendable {
  public var maximumAttempts: Int?
  public var baseDelayMilliseconds: UInt64
  public var maximumDelayMilliseconds: UInt64

  public init(
    maximumAttempts: Int? = nil,
    baseDelayMilliseconds: UInt64 = 1_000,
    maximumDelayMilliseconds: UInt64 = 30_000
  ) {
    self.maximumAttempts = maximumAttempts.map { max(0, $0) }
    self.baseDelayMilliseconds = baseDelayMilliseconds
    self.maximumDelayMilliseconds = maximumDelayMilliseconds
  }

  public func allowsAttempt(_ attempt: Int) -> Bool {
    guard attempt > 0 else { return false }
    return maximumAttempts.map { attempt <= $0 } ?? true
  }

  public func delayMilliseconds(forAttempt attempt: Int) -> UInt64 {
    guard attempt > 0 else { return 0 }
    let exponent = min(attempt - 1, 20)
    let result = baseDelayMilliseconds.multipliedReportingOverflow(by: UInt64(1) << exponent)
    let exponentialDelay = result.overflow ? UInt64.max : result.partialValue
    return min(exponentialDelay, maximumDelayMilliseconds)
  }
}
