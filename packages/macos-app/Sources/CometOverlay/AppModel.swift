import Combine
import CometOverlayCore
import CometOverlayUI
import Foundation

@MainActor
final class AppModel: ObservableObject {
  @Published var settings: AppSettings {
    didSet {
      settingsStore.save(settings)
      overlayPresenter.setEnabled(settings.overlaysEnabled)
    }
  }

  @Published private(set) var connectionState: ConnectionState = .disconnected
  @Published private(set) var rooms: [CometRoom] = [.global]

  private let settingsStore: any SettingsStoring
  private let configurationProvider: any RuntimeConfigurationProviding
  private let messageStream: any MessageStreaming
  private let overlayPresenter: any OverlayPresenting
  private var eventsTask: Task<Void, Never>?

  init(
    settingsStore: any SettingsStoring = UserDefaultsSettingsStore(),
    configurationProvider: any RuntimeConfigurationProviding = RuntimeConfigurationLoader(),
    messageStream: any MessageStreaming = CometWebSocketClient(),
    overlayPresenter: any OverlayPresenting = OverlayWindowManager()
  ) {
    self.settingsStore = settingsStore
    self.configurationProvider = configurationProvider
    self.messageStream = messageStream
    self.overlayPresenter = overlayPresenter
    settings = settingsStore.load()
    overlayPresenter.setEnabled(settings.overlaysEnabled)
    observeEvents()
  }

  deinit {
    eventsTask?.cancel()
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

  func connect() {
    let webAppURLValue = settings.webAppURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let webAppURL = URL(string: webAppURLValue) else {
      connectionState = .failed(message: "WebアプリURLが正しくありません")
      return
    }

    connectionState = .connecting
    Task {
      do {
        let configuration = try await configurationProvider.configuration(for: webAppURL)
        guard !configuration.authEnabled else {
          connectionState = .failed(message: "この環境への接続にはログインが必要です（現在未対応）")
          return
        }
        try await messageStream.connect(
          configuration: configuration,
          roomID: settings.selectedRoomID
        )
      } catch {
        connectionState = .failed(message: error.localizedDescription)
      }
    }
  }

  func disconnect() {
    Task { await messageStream.disconnect() }
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

  private func observeEvents() {
    let events = messageStream.events
    eventsTask = Task { [weak self] in
      for await event in events {
        guard !Task.isCancelled else { return }
        self?.handle(event)
      }
    }
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
