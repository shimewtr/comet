import Foundation

extension AppModel {
  func startPresentationTimer() {
    if !settings.presentationTimerEnabled { settings.presentationTimerEnabled = true }
    presentationTimer.start()
    updatePresentationTimerSnapshot()
  }

  func pausePresentationTimer() {
    presentationTimer.pause()
    updatePresentationTimerSnapshot()
  }

  func stopPresentationTimer() {
    presentationTimer.stop()
    updatePresentationTimerSnapshot()
  }

  func adjustPresentationTimer(by seconds: Int) {
    presentationTimer.adjust(by: seconds)
    updatePresentationTimerSnapshot()
    if presentationTimer.status == .stopped {
      settings.presentationTimerDurationSeconds = presentationTimer.configuredDurationSeconds
    }
  }

  func observePresentationTimer() {
    presentationTimerTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(200))
        guard !Task.isCancelled, let self else { return }
        self.presentationTimer.update()
        self.updatePresentationTimerSnapshot()
      }
    }
  }

  func applyPresentationTimerConfiguration() {
    presentationTimerPresenter.apply(
      isEnabled: settings.presentationTimerEnabled,
      selectedDisplayID: settings.selectedDisplayID,
      snapshot: presentationTimerSnapshot
    )
  }

  func updatePresentationTimerSnapshot() {
    let snapshot = presentationTimer.snapshot()
    guard snapshot != presentationTimerSnapshot else { return }
    presentationTimerSnapshot = snapshot
    applyPresentationTimerConfiguration()
  }
}
