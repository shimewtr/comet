import Foundation
import Testing

@testable import CometOverlayCore

@Test
func presentationTimerStartsPausesAndResumesWithoutDrift() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 600)

  timer.start(at: start)
  timer.update(at: start.addingTimeInterval(75.2))
  #expect(timer.snapshot(at: start.addingTimeInterval(75.2)).remainingSeconds == 525)

  timer.pause(at: start.addingTimeInterval(75.2))
  timer.update(at: start.addingTimeInterval(200))
  #expect(timer.status == .paused)
  #expect(timer.remainingSeconds == 525)

  timer.start(at: start.addingTimeInterval(200))
  timer.update(at: start.addingTimeInterval(201))
  #expect(timer.remainingSeconds == 524)
}

@Test
func presentationTimerStopRestoresConfiguredDuration() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 600)
  timer.adjust(by: 60, at: start)
  timer.start(at: start)
  timer.update(at: start.addingTimeInterval(120))

  timer.stop()

  #expect(timer.status == .stopped)
  #expect(timer.remainingSeconds == 660)
  #expect(timer.overtimeSeconds == 0)
  #expect(timer.configuredDurationSeconds == 660)
}

@Test
func presentationTimerAdjustmentsKeepRunningAcrossZero() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 30)
  timer.start(at: start)
  timer.adjust(by: -60, at: start)
  #expect(timer.remainingSeconds == 0)
  #expect(timer.overtimeSeconds == 30)
  #expect(timer.status == .running)
  #expect(timer.snapshot(at: start).attention == .expired)

  timer.adjust(by: 10, at: start.addingTimeInterval(1))
  #expect(timer.remainingSeconds == 0)
  #expect(timer.overtimeSeconds == 21)
  #expect(timer.status == .running)

  timer.adjust(by: 30, at: start.addingTimeInterval(1))
  #expect(timer.remainingSeconds == 9)
  #expect(timer.overtimeSeconds == 0)
  timer.update(at: start.addingTimeInterval(2))
  #expect(timer.remainingSeconds == 8)
}

@Test
func presentationTimerWarnsAtEveryMinuteBoundaryBelowFiveMinutes() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 301)
  timer.start(at: start)

  timer.update(at: start.addingTimeInterval(1))
  #expect(timer.remainingSeconds == 300)
  #expect(timer.snapshot(at: start.addingTimeInterval(1)).attention == .normal)

  timer.update(at: start.addingTimeInterval(2))
  #expect(timer.remainingSeconds == 299)
  #expect(timer.snapshot(at: start.addingTimeInterval(2)).attention == .minuteWarning)
  #expect(timer.snapshot(at: start.addingTimeInterval(5.1)).attention == .normal)

  timer.update(at: start.addingTimeInterval(62))
  #expect(timer.remainingSeconds == 239)
  #expect(timer.snapshot(at: start.addingTimeInterval(62)).attention == .minuteWarning)
}

@Test
func presentationTimerClearsMinuteWarningWhenTimeIsAddedAboveFiveMinutes() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 301)
  timer.start(at: start)
  timer.update(at: start.addingTimeInterval(2))
  #expect(timer.snapshot(at: start.addingTimeInterval(2)).attention == .minuteWarning)

  timer.adjust(by: 60, at: start.addingTimeInterval(2))

  #expect(timer.remainingSeconds == 359)
  #expect(timer.snapshot(at: start.addingTimeInterval(2)).attention == .normal)
}

@Test
func presentationTimerRemainsExpiredAfterReachingZero() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 2)
  timer.start(at: start)
  timer.update(at: start.addingTimeInterval(10))

  #expect(timer.remainingSeconds == 0)
  #expect(timer.overtimeSeconds == 8)
  #expect(timer.snapshot(at: start.addingTimeInterval(10)).formattedRemainingTime == "+00:08")
  #expect(timer.snapshot(at: start.addingTimeInterval(10)).attention == .expired)

  timer.update(at: start.addingTimeInterval(70))
  #expect(timer.overtimeSeconds == 68)
  #expect(timer.snapshot(at: start.addingTimeInterval(70)).formattedRemainingTime == "+01:08")
  #expect(timer.snapshot(at: start.addingTimeInterval(70)).attention == .expired)
}

@Test
func presentationTimerDoesNotAnimateWhenAdjustedWhileStoppedOrPaused() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 301)

  timer.adjust(by: -2, at: start)
  #expect(timer.remainingSeconds == 299)
  #expect(timer.snapshot(at: start).attention == .normal)

  timer.adjust(by: -299, at: start)
  #expect(timer.remainingSeconds == 0)
  #expect(timer.snapshot(at: start).attention == .normal)

  timer.adjust(by: 301, at: start)
  timer.start(at: start)
  timer.update(at: start.addingTimeInterval(2))
  #expect(timer.snapshot(at: start.addingTimeInterval(2)).attention == .minuteWarning)

  timer.pause(at: start.addingTimeInterval(2))
  timer.adjust(by: -60, at: start.addingTimeInterval(2))
  #expect(timer.status == .paused)
  #expect(timer.remainingSeconds == 239)
  #expect(timer.snapshot(at: start.addingTimeInterval(2)).attention == .normal)
}

@Test
func presentationTimerCanPauseAndResumeOvertime() {
  let start = Date(timeIntervalSince1970: 1_000)
  var timer = PresentationTimer(durationSeconds: 2)
  timer.start(at: start)
  timer.pause(at: start.addingTimeInterval(10))

  #expect(timer.status == .paused)
  #expect(timer.overtimeSeconds == 8)
  #expect(timer.snapshot(at: start.addingTimeInterval(10)).attention == .normal)

  timer.start(at: start.addingTimeInterval(20))
  timer.update(at: start.addingTimeInterval(21))
  #expect(timer.status == .running)
  #expect(timer.overtimeSeconds == 9)
  #expect(timer.snapshot(at: start.addingTimeInterval(21)).attention == .expired)
}

@Test
func presentationTimerFormatsMinuteAndHourDurations() {
  #expect(
    PresentationTimerSnapshot(status: .paused, remainingSeconds: 65, attention: .normal)
      .formattedRemainingTime == "01:05"
  )
  #expect(
    PresentationTimerSnapshot(status: .paused, remainingSeconds: 3_661, attention: .normal)
      .formattedRemainingTime == "01:01:01"
  )
  #expect(
    PresentationTimerSnapshot(
      status: .running,
      remainingSeconds: 0,
      overtimeSeconds: 65,
      attention: .expired
    ).formattedRemainingTime == "+01:05"
  )
}
