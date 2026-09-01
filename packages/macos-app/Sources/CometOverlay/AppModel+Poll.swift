import CometOverlayCore
import Foundation

extension AppModel {
  var canStartPoll: Bool {
    connectionState == .connected && poll == nil && pollDraft.isValid
  }

  var canManagePoll: Bool {
    guard let poll else { return false }
    return poll.roomId == settings.selectedRoomID && settings.controlledPollID == poll.id
  }

  func showPollSetup() {
    guard poll == nil else { return }
    pollMessage = nil
    isPreparingPoll = true
  }

  func cancelPollSetup() { isPreparingPoll = false }

  func addPollOption() {
    guard pollDraft.options.count < 8 else { return }
    let candidates = ["5️⃣", "6️⃣", "7️⃣", "8️⃣", "🅰️", "🅱️", "✅", "❓"]
    let emoji =
      candidates.first { candidate in
        !pollDraft.options.contains(where: { $0.emoji == candidate })
      } ?? "✨"
    pollDraft.options.append(
      PresentationPollOption(
        emojiId: PresentationPollDraft.emojiID(for: emoji),
        emoji: emoji,
        label: "選択肢\(pollDraft.options.count + 1)"
      ))
  }

  func removePollOption(id: String) {
    guard pollDraft.options.count > 2 else { return }
    pollDraft.options.removeAll { $0.id == id }
  }

  func startPoll() {
    guard canStartPoll else { return }
    let payload = StartPresentationPollPayload(
      controllerId: settings.pollControllerID,
      title: pollDraft.title.trimmingCharacters(in: .whitespacesAndNewlines),
      options: pollDraft.options.map { option in
        PresentationPollOption(
          id: option.id,
          emojiId: PresentationPollDraft.emojiID(for: option.emoji),
          emoji: option.emoji.trimmingCharacters(in: .whitespacesAndNewlines),
          label: option.label.trimmingCharacters(in: .whitespacesAndNewlines)
        )
      },
      durationSeconds: pollDraft.durationSeconds
    )
    pollMessage = nil
    Task {
      do {
        isAwaitingPollStart = true
        try await messageStream.startPoll(payload)
        isPreparingPoll = false
      } catch {
        isAwaitingPollStart = false
        pollMessage = "投票を開始できませんでした: \(error.localizedDescription)"
      }
    }
  }

  func endPoll() { if let poll, canManagePoll { sendPollControl(.end, for: poll) } }
  func cancelActivePoll() { if let poll, canManagePoll { sendPollControl(.cancel, for: poll) } }
  func closePollResults() { if let poll, canManagePoll { sendPollControl(.close, for: poll) } }

  func observePoll() {
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(200))
        guard !Task.isCancelled, let self, let poll = self.poll else { continue }
        guard poll.status == .active, self.canManagePoll,
          self.requestedPollEndID != poll.id,
          poll.endsAt <= Int64(Date().timeIntervalSince1970 * 1_000)
        else { continue }
        self.requestedPollEndID = poll.id
        self.endPoll()
      }
    }
  }

  func applyPollConfiguration() {
    pollPresenter.apply(selectedDisplayID: settings.selectedDisplayID, poll: poll)
  }

  private enum PollControlAction { case end, cancel, close }

  private func sendPollControl(_ action: PollControlAction, for poll: PresentationPoll) {
    let payload = PresentationPollControlPayload(
      pollId: poll.id, controllerId: settings.pollControllerID)
    pollMessage = nil
    Task {
      do {
        switch action {
        case .end: try await messageStream.endPoll(payload)
        case .cancel: try await messageStream.cancelPoll(payload)
        case .close: try await messageStream.closePoll(payload)
        }
      } catch {
        pollMessage = "投票を更新できませんでした: \(error.localizedDescription)"
      }
    }
  }
}
