import Foundation

public struct ReconnectPolicy: Equatable, Sendable {
  public var maximumAttempts: Int
  public var baseDelayMilliseconds: UInt64

  public init(maximumAttempts: Int = 5, baseDelayMilliseconds: UInt64 = 1_000) {
    self.maximumAttempts = max(0, maximumAttempts)
    self.baseDelayMilliseconds = baseDelayMilliseconds
  }

  public func delayMilliseconds(forAttempt attempt: Int) -> UInt64 {
    guard attempt > 0 else { return 0 }
    let exponent = min(attempt - 1, 20)
    let result = baseDelayMilliseconds.multipliedReportingOverflow(by: UInt64(1) << exponent)
    return result.overflow ? UInt64.max : result.partialValue
  }
}
