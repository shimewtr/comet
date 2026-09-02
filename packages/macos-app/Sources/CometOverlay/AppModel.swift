import Combine
import CometOverlayCore
import CometOverlayUI
import Foundation
import OSLog

@MainActor
final class AppModel: ObservableObject {
  @Published var settings: AppSettings {
    didSet {
      settingsStore.save(settings)
      applyOverlayConfiguration()
      applyParticipationQRConfiguration()
      applyCommentListConfiguration()
      applyPresentationTimerConfiguration()
      applyPollConfiguration()
    }
  }

  @Published var connectionState: ConnectionState = .disconnected
  @Published var rooms: [CometRoom] = [.global]
  @Published var displays: [OverlayDisplayDescriptor] = []
  @Published var authenticationRequired = false
  @Published var isAuthenticated = false
  @Published var presentationTimerSnapshot = PresentationTimer().snapshot()
  @Published var recentComments: [CometComment] = []
  @Published var poll: PresentationPoll?
  @Published var pollDraft = PresentationPollDraft()
  @Published var isPreparingPoll = false
  @Published var pollMessage: String?

  let settingsStore: any SettingsStoring
  let configurationProvider: any RuntimeConfigurationProviding
  let messageStream: any MessageStreaming
  let overlayPresenter: any OverlayPresenting
  let participationQRPresenter = ParticipationQRWindowManager()
  let commentListPresenter = CommentListWindowManager()
  let presentationTimerPresenter = PresentationTimerWindowManager()
  let pollPresenter = PollWindowManager()
  let authenticator: any DesktopAuthenticating
  var presentationTimer = PresentationTimer()
  var commentList = RecentCommentList()
  var eventsTask: Task<Void, Never>?
  var authRefreshTask: Task<Void, Never>?
  var presentationTimerTask: Task<Void, Never>?
  var pollTask: Task<Void, Never>?
  var isAwaitingPollStart = false
  var requestedPollEndID: String?
  var displayChangesCancellable: AnyCancellable?

  init(
    settingsStore: any SettingsStoring = UserDefaultsSettingsStore(),
    configurationProvider: any RuntimeConfigurationProviding = RuntimeConfigurationLoader(),
    messageStream: any MessageStreaming = CometWebSocketClient(),
    overlayPresenter: any OverlayPresenting = OverlayWindowManager(),
    authenticator: any DesktopAuthenticating = DesktopAuthenticationController()
  ) {
    self.settingsStore = settingsStore
    self.configurationProvider = configurationProvider
    self.messageStream = messageStream
    self.overlayPresenter = overlayPresenter
    self.authenticator = authenticator
    settings = settingsStore.load()
    presentationTimer = PresentationTimer(
      durationSeconds: settings.presentationTimerDurationSeconds
    )
    presentationTimerSnapshot = presentationTimer.snapshot()
    settingsStore.save(settings)
    presentationTimerPresenter.onStart = { [weak self] in
      self?.startPresentationTimer()
    }
    presentationTimerPresenter.onPause = { [weak self] in
      self?.pausePresentationTimer()
    }
    presentationTimerPresenter.onStop = { [weak self] in
      self?.stopPresentationTimer()
    }
    presentationTimerPresenter.onAdjust = { [weak self] seconds in
      self?.adjustPresentationTimer(by: seconds)
    }
    displays = overlayPresenter.availableDisplays
    applyOverlayConfiguration()
    applyParticipationQRConfiguration()
    applyCommentListConfiguration()
    applyPresentationTimerConfiguration()
    applyPollConfiguration()
    observeEvents()
    observeDisplayChanges()
    observePresentationTimer()
    observePoll()
  }

  deinit {
    eventsTask?.cancel()
    authRefreshTask?.cancel()
    presentationTimerTask?.cancel()
    pollTask?.cancel()
  }

  var connectionDescription: String {
    switch connectionState {
    case .disconnected:
      "未接続"
    case .connecting:
      "接続中"
    case .connected:
      "接続済み"
    case .failed(let message):
      "エラー: \(message)"
    }
  }

  var canConnect: Bool {
    !settings.webAppURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
      && connectionState != .connecting
  }

  var canLogout: Bool {
    let value = settings.webAppURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: value) else { return false }
    return (try? DesktopAuthURLBuilder.origin(for: url)) != nil
  }

  var authenticationDescription: String {
    if !authenticationRequired { return "認証なし" }
    return isAuthenticated ? "ログイン済み" : "ログインが必要"
  }

  func hideAllImmediately() {
    settings.overlaysEnabled = false
  }

  func resetSettings() {
    disconnect()
    authenticationRequired = false
    isAuthenticated = false
    rooms = [.global]
    presentationTimer = PresentationTimer()
    updatePresentationTimerSnapshot()
    poll = nil
    applyPollConfiguration()
    settings = AppSettings()
  }

}
