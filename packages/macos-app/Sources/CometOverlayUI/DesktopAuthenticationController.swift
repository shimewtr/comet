import AppKit
import CometOverlayCore
import Foundation

@MainActor
public final class DesktopAuthenticationController: NSObject, DesktopAuthenticating {
  private let ticketStore: any AuthTicketStoring
  private let session: URLSession

  public init(
    ticketStore: any AuthTicketStoring = KeychainAuthTicketStore(),
    session: URLSession = .shared
  ) {
    self.ticketStore = ticketStore
    self.session = session
  }

  public func validTicket(for webAppURL: URL) async throws -> AuthTicket? {
    let origin = try DesktopAuthURLBuilder.origin(for: webAppURL)
    guard let ticket = try await ticketStore.load(for: origin) else { return nil }
    if ticket.isValid() { return ticket }
    if ticket.canRefresh() {
      return try await refresh(ticket, webAppURL: webAppURL, origin: origin)
    }
    try await ticketStore.remove(for: origin)
    return nil
  }

  public func authenticate(webAppURL: URL) async throws -> AuthTicket {
    let authorizationRequest = try DesktopAuthorizationRequest()
    let loginURL = try DesktopAuthURLBuilder.loginURL(
      webAppURL: webAppURL,
      request: authorizationRequest
    )
    let callbackURL = try await startWebAuthentication(at: loginURL)
    let code = try DesktopAuthURLBuilder.authorizationCode(
      callbackURL: callbackURL,
      expectedState: authorizationRequest.state
    )
    let ticket = try await exchange(
      code: code,
      verifier: authorizationRequest.verifier,
      webAppURL: webAppURL
    )
    try await ticketStore.save(
      ticket,
      for: DesktopAuthURLBuilder.origin(for: webAppURL)
    )
    return ticket
  }

  public func refreshTicket(for webAppURL: URL) async throws -> AuthTicket? {
    let origin = try DesktopAuthURLBuilder.origin(for: webAppURL)
    guard let ticket = try await ticketStore.load(for: origin), ticket.canRefresh() else {
      try await ticketStore.remove(for: origin)
      return nil
    }
    return try await refresh(ticket, webAppURL: webAppURL, origin: origin)
  }

  public func logout(webAppURL: URL) async throws {
    let origin = try DesktopAuthURLBuilder.origin(for: webAppURL)
    try await ticketStore.remove(for: origin)
    let callbackURL = try await DesktopAuthenticationCallbackBroker.shared.open(
      at: DesktopAuthURLBuilder.logoutURL(webAppURL: webAppURL)
    )
    try DesktopAuthURLBuilder.validateLogoutCallback(callbackURL)
  }

  private func startWebAuthentication(at url: URL) async throws -> URL {
    try await DesktopAuthenticationCallbackBroker.shared.open(at: url)
  }

  private func exchange(
    code: String,
    verifier: String,
    webAppURL: URL
  ) async throws -> AuthTicket {
    let exchangeURL = try DesktopAuthURLBuilder.exchangeURL(webAppURL: webAppURL)
    var request = URLRequest(url: exchangeURL)
    request.httpMethod = "POST"
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    var body = URLComponents()
    body.queryItems = [
      URLQueryItem(name: "code", value: code),
      URLQueryItem(name: "code_verifier", value: verifier),
    ]
    request.httpBody = Data((body.percentEncodedQuery ?? "").utf8)

    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode)
    else {
      throw DesktopAuthenticationError.exchangeFailed(
        statusCode: (response as? HTTPURLResponse)?.statusCode ?? 0
      )
    }
    let ticket = try JSONDecoder().decode(AuthTicket.self, from: data)
    guard ticket.token.count >= 20,
      ticket.isValid(refreshLeewayMilliseconds: 0),
      ticket.canRefresh()
    else {
      throw DesktopAuthenticationError.invalidTicket
    }
    return ticket
  }

  private func refresh(
    _ ticket: AuthTicket,
    webAppURL: URL,
    origin: String
  ) async throws -> AuthTicket? {
    guard let refreshToken = ticket.refreshToken else { return nil }
    var request = URLRequest(url: try DesktopAuthURLBuilder.refreshURL(webAppURL: webAppURL))
    request.httpMethod = "POST"
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
    var body = URLComponents()
    body.queryItems = [URLQueryItem(name: "refresh_token", value: refreshToken)]
    request.httpBody = Data((body.percentEncodedQuery ?? "").utf8)

    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse else {
      throw DesktopAuthenticationError.refreshFailed(statusCode: 0)
    }
    if response.statusCode == 401 || response.statusCode == 403 {
      try await ticketStore.remove(for: origin)
      return nil
    }
    guard (200..<300).contains(response.statusCode) else {
      throw DesktopAuthenticationError.refreshFailed(statusCode: response.statusCode)
    }
    let accessTicket = try JSONDecoder().decode(AccessTicket.self, from: data)
    let refreshedTicket = AuthTicket(
      token: accessTicket.token,
      expiresAt: accessTicket.expiresAt,
      refreshToken: ticket.refreshToken,
      refreshExpiresAt: ticket.refreshExpiresAt
    )
    guard refreshedTicket.token.count >= 20,
      refreshedTicket.isValid(refreshLeewayMilliseconds: 0)
    else {
      throw DesktopAuthenticationError.invalidTicket
    }
    try await ticketStore.save(refreshedTicket, for: origin)
    return refreshedTicket
  }
}

private struct AccessTicket: Decodable {
  let token: String
  let expiresAt: Int64
}

@MainActor
public final class DesktopAuthenticationCallbackBroker {
  public static let shared = DesktopAuthenticationCallbackBroker()

  private var pendingContinuation: CheckedContinuation<URL, any Error>?
  private var timeoutTask: Task<Void, Never>?

  private init() {}

  public func open(at url: URL) async throws -> URL {
    cancelPendingRequest()
    return try await withCheckedThrowingContinuation { continuation in
      pendingContinuation = continuation
      guard NSWorkspace.shared.open(url) else {
        finish(with: .failure(DesktopAuthenticationError.invalidCallback))
        return
      }
      timeoutTask = Task { @MainActor [weak self] in
        try? await Task.sleep(for: .seconds(300))
        guard !Task.isCancelled else { return }
        self?.finish(with: .failure(DesktopAuthenticationError.cancelled))
      }
    }
  }

  public func receive(_ url: URL) {
    guard url.scheme == DesktopAuthURLBuilder.callbackScheme else { return }
    finish(with: .success(url))
  }

  private func cancelPendingRequest() {
    guard pendingContinuation != nil else { return }
    finish(with: .failure(DesktopAuthenticationError.cancelled))
  }

  private func finish(with result: Result<URL, any Error>) {
    let continuation = pendingContinuation
    pendingContinuation = nil
    timeoutTask?.cancel()
    timeoutTask = nil
    continuation?.resume(with: result)
  }
}
