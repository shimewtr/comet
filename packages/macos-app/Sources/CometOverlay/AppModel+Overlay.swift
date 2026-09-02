import Combine
import CometOverlayCore
import Foundation

extension AppModel {
  func applyAllSettings() {
    applyOverlayConfiguration()
    applyParticipationQRConfiguration()
    applyCommentListConfiguration()
    applyPresentationTimerConfiguration()
    applyPollConfiguration()
  }

  func applySettingsChanges(from previous: AppSettings) {
    let displayChanged = previous.selectedDisplayID != settings.selectedDisplayID
    if displayChanged
      || previous.overlaysEnabled != settings.overlaysEnabled
      || previous.displaySettings != settings.displaySettings
    {
      applyOverlayConfiguration()
    }
    if displayChanged
      || previous.participationQREnabled != settings.participationQREnabled
      || previous.webAppURL != settings.webAppURL
      || previous.selectedRoomID != settings.selectedRoomID
    {
      applyParticipationQRConfiguration()
    }
    if displayChanged || previous.commentListEnabled != settings.commentListEnabled {
      applyCommentListConfiguration()
    }
    if displayChanged || previous.presentationTimerEnabled != settings.presentationTimerEnabled {
      applyPresentationTimerConfiguration()
    }
    if displayChanged { applyPollConfiguration() }
  }

  func previewOverlay() {
    let timestamp = Int64(Date().timeIntervalSince1970 * 1_000)
    let messages = [
      "Comet テストコメント", "いいね！", "すごい！", "👏👏👏", "ここ好き", "ナイス発表です", "わかりやすい", "なるほど", "最高！",
      "質問があります 🙋", "盛り上がってきた", "ありがとうございます！",
    ]
    let colors = ["#ffffff", "#ffeb3b", "#81d4fa", "#ff8a80", "#b9f6ca", "#e1bee7"]
    let sizes: [CommentSize] = [.small, .medium, .large]
    let animations: [CommentAnimation] = [.none, .blink, .bounce, .shake]
    for index in 0..<16 {
      overlayPresenter.show(
        comment: CometComment(
          id: UUID().uuidString,
          content: messages.randomElement() ?? "Comet",
          timestamp: timestamp + Int64(index),
          style: CommentStyle(
            color: colors.randomElement() ?? "#ffffff",
            size: sizes.randomElement() ?? .medium,
            animation: animations.randomElement() ?? CommentAnimation.none,
            speed: Double.random(in: 3...8)
          )
        ), placement: .scrolling)
    }
    previewStamps(startingAt: timestamp)
  }

  func observeDisplayChanges() {
    displayChangesCancellable = NotificationCenter.default.publisher(
      for: .cometOverlayDisplaysDidChange
    )
    .sink { [weak self] _ in
      Task { @MainActor [weak self] in
        self?.displays = self?.overlayPresenter.availableDisplays ?? []
      }
    }
  }

  func applyOverlayConfiguration() {
    overlayPresenter.apply(
      configuration: OverlayPresentationConfiguration(
        isEnabled: settings.overlaysEnabled,
        selectedDisplayID: settings.selectedDisplayID,
        displaySettings: settings.displaySettings
      ))
  }

  func applyParticipationQRConfiguration() {
    participationQRPresenter.apply(
      isEnabled: settings.participationQREnabled,
      webAppURL: settings.webAppURL,
      roomID: settings.selectedRoomID,
      selectedDisplayID: settings.selectedDisplayID
    )
  }

  func applyCommentListConfiguration() {
    commentListPresenter.apply(
      isEnabled: settings.commentListEnabled,
      comments: recentComments,
      selectedDisplayID: settings.selectedDisplayID
    )
  }

  func appendCommentToList(_ comment: CometComment) {
    commentList.append(comment)
    recentComments = commentList.comments
    applyCommentListConfiguration()
  }

  private func previewStamps(startingAt timestamp: Int64) {
    let emojis = ["🎉", "👏", "👍", "❤️", "🚀", "✨", "🔥", "🙌", "😂", "💯"]
    let comboEmoji = emojis.randomElement() ?? "🎉"
    Task { @MainActor [weak self] in
      guard let self else { return }
      for index in 0..<3 {
        showPreviewStamp(
          id: "preview-normal-\(index)", emoji: emojis.randomElement() ?? "🎉",
          timestamp: timestamp + Int64(index))
        try? await Task.sleep(for: .milliseconds(180))
      }
      try? await Task.sleep(for: .milliseconds(900))
      guard !Task.isCancelled else { return }
      for index in 0..<5 {
        showPreviewStamp(
          id: "preview-combo", emoji: comboEmoji, timestamp: timestamp + Int64(index + 3))
        try? await Task.sleep(for: .milliseconds(120))
      }
    }
  }

  private func showPreviewStamp(id: String, emoji: String, timestamp: Int64) {
    overlayPresenter.show(
      stamp: StampMessage(
        id: UUID().uuidString,
        stamp: Stamp(id: id, name: emoji, imageUrl: "", category: .reaction),
        timestamp: timestamp,
        position: nil
      ))
  }
}
