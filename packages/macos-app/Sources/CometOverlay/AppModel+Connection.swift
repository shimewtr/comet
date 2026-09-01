import CometOverlayCore
import Foundation
import OSLog

extension AppModel {
  func connect() {
    let value = settings.webAppURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let webAppURL = URL(string: value) else {
      connectionState = .failed(message: "WebアプリURLが正しくありません")
      return
    }
    connectionState = .connecting
    AppLog.connection.notice("Connection requested")
    Task {
      do {
        try await establishConnection(webAppURL: webAppURL)
      } catch {
        AppLog.connection.error("Connection failed: \(AppLog.errorType(error), privacy: .public)")
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
        AppLog.connection.error("Logout failed: \(AppLog.errorType(error), privacy: .public)")
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
      do { try await messageStream.joinRoom(roomID) } catch {
        connectionState = .failed(message: error.localizedDescription)
      }
    }
  }

  func refreshRooms() {
    guard connectionState == .connected else { return }
    Task {
      do { try await messageStream.requestRooms() } catch {
        connectionState = .failed(message: error.localizedDescription)
      }
    }
  }

  private func establishConnection(webAppURL: URL) async throws {
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
        baseURL: configuration.websocketURL, ticket: ticket
      )
      isAuthenticated = true
      scheduleAuthenticationRefresh(
        ticket: ticket, webAppURL: webAppURL, baseConfiguration: baseConfiguration)
    } else {
      isAuthenticated = false
      authRefreshTask?.cancel()
      authRefreshTask = nil
    }
    try await messageStream.connect(configuration: configuration, roomID: settings.selectedRoomID)
  }

  private func scheduleAuthenticationRefresh(
    ticket: AuthTicket,
    webAppURL: URL,
    baseConfiguration: RuntimeConfiguration
  ) {
    authRefreshTask?.cancel()
    let delay = max(0, ticket.expiresAt - Int64(Date().timeIntervalSince1970 * 1_000) - 60_000)
    authRefreshTask = Task { [weak self] in
      do {
        try await Task.sleep(for: .milliseconds(delay))
        guard !Task.isCancelled, let self else { return }
        let refreshedTicket = try await self.authenticator.authenticate(webAppURL: webAppURL)
        var configuration = baseConfiguration
        configuration.websocketURL = try DesktopAuthURLBuilder.authenticatedWebSocketURL(
          baseURL: baseConfiguration.websocketURL, ticket: refreshedTicket
        )
        await self.messageStream.disconnect()
        try await self.messageStream.connect(
          configuration: configuration, roomID: self.settings.selectedRoomID)
        self.isAuthenticated = true
        self.scheduleAuthenticationRefresh(
          ticket: refreshedTicket, webAppURL: webAppURL, baseConfiguration: baseConfiguration)
      } catch is CancellationError {
        return
      } catch {
        AppLog.connection.error(
          "Authentication refresh failed: \(AppLog.errorType(error), privacy: .public)")
        self?.isAuthenticated = false
        self?.connectionState = .failed(message: error.localizedDescription)
      }
    }
  }
}
