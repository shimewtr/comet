import Testing

@testable import CometOverlayCore

@Test
func reconnectPolicyUsesExponentialBackoff() {
  let policy = ReconnectPolicy(
    maximumAttempts: 5,
    baseDelayMilliseconds: 250,
    maximumDelayMilliseconds: 10_000
  )

  #expect(policy.delayMilliseconds(forAttempt: 0) == 0)
  #expect(policy.delayMilliseconds(forAttempt: 1) == 250)
  #expect(policy.delayMilliseconds(forAttempt: 2) == 500)
  #expect(policy.delayMilliseconds(forAttempt: 3) == 1_000)
  #expect(policy.delayMilliseconds(forAttempt: 20) == 10_000)
  #expect(policy.allowsAttempt(5))
  #expect(!policy.allowsAttempt(6))
}

@Test
func reconnectPolicySaturatesInsteadOfOverflowing() {
  let policy = ReconnectPolicy(
    maximumAttempts: 2,
    baseDelayMilliseconds: UInt64.max,
    maximumDelayMilliseconds: UInt64.max
  )

  #expect(policy.delayMilliseconds(forAttempt: 2) == UInt64.max)
}

@Test
func reconnectPolicyRetriesForeverByDefaultWithCappedDelay() {
  let policy = ReconnectPolicy(baseDelayMilliseconds: 1_000)

  #expect(policy.maximumAttempts == nil)
  #expect(policy.allowsAttempt(1_000_000))
  #expect(policy.delayMilliseconds(forAttempt: 1_000_000) == 30_000)
}
