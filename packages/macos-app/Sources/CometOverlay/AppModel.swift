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
      applyPresentationTimerConfiguration()
      applyPollConfiguration()
    }
  }

  @Published private(set) var connectionState: ConnectionState = .disconnected
  @Published private(set) var rooms: [CometRoom] = [.global]
  @Published private(set) var displays: [OverlayDisplayDescriptor] = []
  @Published private(set) var authenticationRequired = false
  @Published private(set) var isAuthenticated = false
  @Published private(set) var presentationTimerSnapshot = PresentationTimer().snapshot()
  @Published private(set) var poll: PresentationPoll?
  @Published var pollDraft = PresentationPollDraft()
  @Published var isPreparingPoll = false
  @Published private(set) var pollMessage: String?

  private let settingsStore: any SettingsStoring
  private let configurationProvider: any RuntimeConfigurationProviding
  private let messageStream: any MessageStreaming
  private let overlayPresenter: any OverlayPresenting
  private let participationQRPresenter = ParticipationQRWindowManager()
  private let presentationTimerPresenter = PresentationTimerWindowManager()
  private let pollPresenter = PollWindowManager()
  private let authenticator: any DesktopAuthenticating
  private var presentationTimer = PresentationTimer()
  private var eventsTask: Task<Void, Never>?
  private var authRefreshTask: Task<Void, Never>?
  private var presentationTimerTask: Task<Void, Never>?
  private var pollTask: Task<Void, Never>?
  private var isAwaitingPollStart = false
  private var requestedPollEndID: String?
  private var displayChangesCancellable: AnyCancellable?

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

  func connect() {
    let webAppURLValue = settings.webAppURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let webAppURL = URL(string: webAppURLValue) else {
      connectionState = .failed(message: "WebアプリURLが正しくありません")
      return
    }

    connectionState = .connecting
    AppLog.connection.notice("Connection requested")
    Task {
      do {
        try await connect(webAppURL: webAppURL)
      } catch {
        AppLog.connection.error(
          "Connection failed: \(AppLog.errorType(error), privacy: .public)"
        )
        connectionState = .failed(message: error.localizedDescription)
      }
    }
  }

  func disconnect() {
    authRefreshTask?.cancel()
    authRefreshTask = nil
    AppLog.connection.notice("Disconnect requested")
    Task { await messageStream.disconnect() }
  }

  func logout() {
    guard let webAppURL = URL(string: settings.webAppURL) else { return }
    authRefreshTask?.cancel()
    authRefreshTask = nil
    Task {
      await messageStream.disconnect()
      isAuthenticated = false
      do {
        try await authenticator.logout(webAppURL: webAppURL)
      } catch {
        AppLog.connection.error(
          "Logout failed: \(AppLog.errorType(error), privacy: .public)"
        )
        connectionState = .failed(message: error.localizedDescription)
      }
    }
  }

  func selectRoom(_ roomID: String) {
    guard poll?.status != .active else {
      pollMessage = "投票中はRoomを切り替えられません"
      return
    }
    settings.selectedRoomID = roomID
    guard connectionState == .connected else { return }
    Task {
      do {
        try await messageStream.joinRoom(roomID)
      } catch {
        connectionState = .failed(message: error.localizedDescription)
      }
    }
  }

  func refreshRooms() {
    guard connectionState == .connected else { return }
    Task {
      do {
        try await messageStream.requestRooms()
      } catch {
        connectionState = .failed(message: error.localizedDescription)
      }
    }
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

  func startPresentationTimer() {
    if !settings.presentationTimerEnabled {
      settings.presentationTimerEnabled = true
    }
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
      settings.presentationTimerDurationSeconds =
        presentationTimer.configuredDurationSeconds
    }
  }

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

  func cancelPollSetup() {
    isPreparingPoll = false
  }

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
      )
    )
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

  func endPoll() {
    guard let poll, canManagePoll else { return }
    sendPollControl(.end, for: poll)
  }

  func cancelActivePoll() {
    guard let poll, canManagePoll else { return }
    sendPollControl(.cancel, for: poll)
  }

  func closePollResults() {
    guard let poll, canManagePoll else { return }
    sendPollControl(.close, for: poll)
  }

  private enum PollControlAction {
    case end
    case cancel
    case close
  }

  private func sendPollControl(
    _ action: PollControlAction,
    for poll: PresentationPoll
  ) {
    let payload = PresentationPollControlPayload(
      pollId: poll.id,
      controllerId: settings.pollControllerID
    )
    pollMessage = nil
    Task {
      do {
        switch action {
        case .end:
          try await messageStream.endPoll(payload)
        case .cancel:
          try await messageStream.cancelPoll(payload)
        case .close:
          try await messageStream.closePoll(payload)
        }
      } catch {
        pollMessage = "投票を更新できませんでした: \(error.localizedDescription)"
      }
    }
  }

  func previewOverlay() {
    let timestamp = Int64(Date().timeIntervalSince1970 * 1_000)
    let messages = [
      "Comet テストコメント", "いいね！", "すごい！", "👏👏👏", "ここ好き",
      "ナイス発表です", "わかりやすい", "なるほど", "最高！", "質問があります 🙋",
      "盛り上がってきた", "ありがとうございます！",
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
        ),
        placement: .scrolling
      )
    }

    let emojis = ["🎉", "👏", "👍", "❤️", "🚀", "✨", "🔥", "🙌", "😂", "💯"]
    let comboEmoji = emojis.randomElement() ?? "🎉"
    Task { @MainActor [weak self] in
      guard let self else { return }

      // 通常演出を単独で確認してから、同じスタンプの5連打で破裂演出を確認する。
      for index in 0..<3 {
        let emoji = emojis.randomElement() ?? "🎉"
        overlayPresenter.show(
          stamp: StampMessage(
            id: UUID().uuidString,
            stamp: Stamp(
              id: "preview-normal-\(index)",
              name: emoji,
              imageUrl: "",
              category: .reaction
            ),
            timestamp: timestamp + Int64(index),
            position: nil
          )
        )
        try? await Task.sleep(for: .milliseconds(180))
      }

      try? await Task.sleep(for: .milliseconds(900))
      guard !Task.isCancelled else { return }

      for index in 0..<5 {
        overlayPresenter.show(
          stamp: StampMessage(
            id: UUID().uuidString,
            stamp: Stamp(
              id: "preview-combo",
              name: comboEmoji,
              imageUrl: "",
              category: .reaction
            ),
            timestamp: timestamp + Int64(index + 3),
            position: nil
          )
        )
        try? await Task.sleep(for: .milliseconds(120))
      }
    }
  }

  private func observeEvents() {
    let events = messageStream.events
    eventsTask = Task { [weak self] in
      for await event in events {
        guard !Task.isCancelled else { return }
        self?.handle(event)
      }
    }
  }

  private func connect(webAppURL: URL) async throws {
    var configuration = try await configurationProvider.configuration(for: webAppURL)
    authenticationRequired = configuration.authEnabled
    if configuration.authEnabled {
      let baseConfiguration = configuration
      let ticket: AuthTicket
      if let storedTicket = try await authenticator.validTicket(for: webAppURL) {
        ticket = storedTicket
      } else {
        ticket = try await authenticator.authenticate(webAppURL: webAppURL)
      }
      configuration.websocketURL = try DesktopAuthURLBuilder.authenticatedWebSocketURL(
        baseURL: configuration.websocketURL,
        ticket: ticket
      )
      isAuthenticated = true
      scheduleAuthenticationRefresh(
        ticket: ticket,
        webAppURL: webAppURL,
        baseConfiguration: baseConfiguration
      )
    } else {
      isAuthenticated = false
      authRefreshTask?.cancel()
      authRefreshTask = nil
    }
    try await messageStream.connect(
      configuration: configuration,
      roomID: settings.selectedRoomID
    )
  }

  private func scheduleAuthenticationRefresh(
    ticket: AuthTicket,
    webAppURL: URL,
    baseConfiguration: RuntimeConfiguration
  ) {
    authRefreshTask?.cancel()
    let now = Int64(Date().timeIntervalSince1970 * 1_000)
    let delayMilliseconds = max(0, ticket.expiresAt - now - 60_000)
    authRefreshTask = Task { [weak self] in
      do {
        try await Task.sleep(for: .milliseconds(delayMilliseconds))
        guard !Task.isCancelled, let self else { return }
        let refreshedTicket = try await self.authenticator.authenticate(webAppURL: webAppURL)
        var refreshedConfiguration = baseConfiguration
        refreshedConfiguration.websocketURL = try DesktopAuthURLBuilder.authenticatedWebSocketURL(
          baseURL: baseConfiguration.websocketURL,
          ticket: refreshedTicket
        )
        await self.messageStream.disconnect()
        try await self.messageStream.connect(
          configuration: refreshedConfiguration,
          roomID: self.settings.selectedRoomID
        )
        self.isAuthenticated = true
        self.scheduleAuthenticationRefresh(
          ticket: refreshedTicket,
          webAppURL: webAppURL,
          baseConfiguration: baseConfiguration
        )
      } catch is CancellationError {
        return
      } catch {
        AppLog.connection.error(
          "Authentication refresh failed: \(AppLog.errorType(error), privacy: .public)"
        )
        self?.isAuthenticated = false
        self?.connectionState = .failed(message: error.localizedDescription)
      }
    }
  }

  private func observeDisplayChanges() {
    displayChangesCancellable = NotificationCenter.default.publisher(
      for: .cometOverlayDisplaysDidChange
    ).sink { [weak self] _ in
      Task { @MainActor [weak self] in
        self?.displays = self?.overlayPresenter.availableDisplays ?? []
      }
    }
  }

  private func observePresentationTimer() {
    presentationTimerTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(200))
        guard !Task.isCancelled, let self else { return }
        self.presentationTimer.update()
        self.updatePresentationTimerSnapshot()
      }
    }
  }

  private func observePoll() {
    pollTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(200))
        guard !Task.isCancelled, let self, let poll = self.poll else { continue }
        guard
          poll.status == .active,
          self.canManagePoll,
          self.requestedPollEndID != poll.id,
          poll.endsAt <= Int64(Date().timeIntervalSince1970 * 1_000)
        else { continue }
        self.requestedPollEndID = poll.id
        self.endPoll()
      }
    }
  }

  private func applyOverlayConfiguration() {
    overlayPresenter.apply(
      configuration: OverlayPresentationConfiguration(
        isEnabled: settings.overlaysEnabled,
        selectedDisplayID: settings.selectedDisplayID,
        displaySettings: settings.displaySettings
      )
    )
  }

  private func applyParticipationQRConfiguration() {
    participationQRPresenter.apply(
      isEnabled: settings.participationQREnabled,
      webAppURL: settings.webAppURL,
      roomID: settings.selectedRoomID,
      selectedDisplayID: settings.selectedDisplayID
    )
  }

  private func applyPresentationTimerConfiguration() {
    presentationTimerPresenter.apply(
      isEnabled: settings.presentationTimerEnabled,
      selectedDisplayID: settings.selectedDisplayID,
      snapshot: presentationTimerSnapshot
    )
  }

  private func applyPollConfiguration() {
    pollPresenter.apply(selectedDisplayID: settings.selectedDisplayID, poll: poll)
  }

  private func updatePresentationTimerSnapshot() {
    let snapshot = presentationTimer.snapshot()
    guard snapshot != presentationTimerSnapshot else { return }
    presentationTimerSnapshot = snapshot
    applyPresentationTimerConfiguration()
  }

  private func handle(_ event: CometClientEvent) {
    switch event {
    case .connectionState(let state):
      connectionState = state
    case .message(.rooms(let updatedRooms)):
      rooms = updatedRooms.isEmpty ? [.global] : updatedRooms
    case .message(.roomJoined(let room)):
      settings.selectedRoomID = room.id
      if !rooms.contains(where: { $0.id == room.id }) {
        rooms.append(room)
      }
    case .message(.serverError(let payload)):
      if let fallbackRoom = payload.fallbackRoom {
        settings.selectedRoomID = fallbackRoom.id
      }
      if payload.code.rawValue.hasPrefix("POLL_") {
        pollMessage = payload.message
      }
    case .message(.comment(let comment, _)):
      overlayPresenter.show(comment: comment, placement: .scrolling)
    case .message(.stamp(let stamp, _)):
      overlayPresenter.show(stamp: stamp)
    case .message(.pollState(let updatedPoll, let roomID)):
      guard roomID == nil || roomID == settings.selectedRoomID else { return }
      poll = updatedPoll
      if updatedPoll != nil {
        // 投票作成画面を開いている間に既存の投票状態を受信した場合も、
        // 先に結果を閉じるべきことが分かる表示へ切り替える。
        isPreparingPoll = false
      }
      if let updatedPoll, updatedPoll.status == .active, isAwaitingPollStart {
        settings.controlledPollID = updatedPoll.id
        isAwaitingPollStart = false
      }
      if updatedPoll == nil {
        settings.controlledPollID = nil
        requestedPollEndID = nil
        isAwaitingPollStart = false
      }
      applyPollConfiguration()
    default:
      break
    }
  }
}
