import Testing

@testable import CometOverlayCore

@Test
func reconnectPolicyUsesExponentialBackoff() {
  let policy = ReconnectPolicy(maximumAttempts: 5, baseDelayMilliseconds: 250)

  #expect(policy.delayMilliseconds(forAttempt: 0) == 0)
  #expect(policy.delayMilliseconds(forAttempt: 1) == 250)
  #expect(policy.delayMilliseconds(forAttempt: 2) == 500)
  #expect(policy.delayMilliseconds(forAttempt: 3) == 1_000)
}

@Test
func reconnectPolicySaturatesInsteadOfOverflowing() {
  let policy = ReconnectPolicy(
    maximumAttempts: 2,
    baseDelayMilliseconds: UInt64.max
  )

  #expect(policy.delayMilliseconds(forAttempt: 2) == UInt64.max)
}
