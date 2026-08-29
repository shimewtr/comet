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
    }
  }

  @Published private(set) var connectionState: ConnectionState = .disconnected
  @Published private(set) var rooms: [CometRoom] = [.global]
  @Published private(set) var displays: [OverlayDisplayDescriptor] = []
  @Published private(set) var authenticationRequired = false
  @Published private(set) var isAuthenticated = false

  private let settingsStore: any SettingsStoring
  private let configurationProvider: any RuntimeConfigurationProviding
  private let messageStream: any MessageStreaming
  private let overlayPresenter: any OverlayPresenting
  private let authenticator: any DesktopAuthenticating
  private var eventsTask: Task<Void, Never>?
  private var authRefreshTask: Task<Void, Never>?
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
    displays = overlayPresenter.availableDisplays
    applyOverlayConfiguration()
    observeEvents()
    observeDisplayChanges()
  }

  deinit {
    eventsTask?.cancel()
    authRefreshTask?.cancel()
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

  func stopOverlayImmediately() {
    settings.overlaysEnabled = false
  }

  func previewOverlay() {
    let timestamp = Int64(Date().timeIntervalSince1970 * 1_000)
    overlayPresenter.show(
      comment: CometComment(
        id: UUID().uuidString,
        content: "Comet テストコメント",
        timestamp: timestamp,
        style: CommentStyle(color: "#ffffff", size: .medium, animation: .bounce, speed: 5)
      ),
      placement: .scrolling
    )
    overlayPresenter.show(
      stamp: StampMessage(
        id: UUID().uuidString,
        stamp: Stamp(id: "preview", name: "🎉", imageUrl: "", category: .reaction),
        timestamp: timestamp,
        position: StampPosition(x: 0.75, y: 0.35)
      )
    )
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

  private func applyOverlayConfiguration() {
    overlayPresenter.apply(
      configuration: OverlayPresentationConfiguration(
        isEnabled: settings.overlaysEnabled,
        selectedDisplayID: settings.selectedDisplayID,
        displaySettings: settings.displaySettings
      )
    )
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
    case .message(.comment(let comment, _)):
      overlayPresenter.show(comment: comment, placement: .scrolling)
    case .message(.stamp(let stamp, _)):
      overlayPresenter.show(stamp: stamp)
    default:
      break
    }
  }
}
