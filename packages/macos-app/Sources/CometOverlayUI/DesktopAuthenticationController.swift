import AppKit
import AuthenticationServices
import CometOverlayCore
import Foundation

@MainActor
public final class DesktopAuthenticationController: NSObject, DesktopAuthenticating {
  private let ticketStore: any AuthTicketStoring
  private let session: URLSession
  private var webAuthenticationSession: ASWebAuthenticationSession?
  private lazy var fallbackPresentationWindow = NSWindow(
    contentRect: NSRect(x: 0, y: 0, width: 1, height: 1),
    styleMask: .borderless,
    backing: .buffered,
    defer: false
  )

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
    guard ticket.isValid() else {
      try await ticketStore.remove(for: origin)
      return nil
    }
    return ticket
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

  public func logout(webAppURL: URL) async throws {
    webAuthenticationSession?.cancel()
    webAuthenticationSession = nil
    let origin = try DesktopAuthURLBuilder.origin(for: webAppURL)
    try await ticketStore.remove(for: origin)
    let callbackURL = try await startWebAuthentication(
      at: DesktopAuthURLBuilder.logoutURL(webAppURL: webAppURL)
    )
    try DesktopAuthURLBuilder.validateLogoutCallback(callbackURL)
  }

  private func startWebAuthentication(at url: URL) async throws -> URL {
    guard webAuthenticationSession == nil else {
      throw DesktopAuthenticationError.cancelled
    }
    return try await withCheckedThrowingContinuation { continuation in
      let authenticationSession = ASWebAuthenticationSession(
        url: url,
        callbackURLScheme: DesktopAuthURLBuilder.callbackScheme
      ) { [weak self] callbackURL, error in
        Task { @MainActor [weak self] in
          self?.webAuthenticationSession = nil
          if let callbackURL {
            continuation.resume(returning: callbackURL)
          } else if let authenticationError = error as? ASWebAuthenticationSessionError,
            authenticationError.code == .canceledLogin
          {
            continuation.resume(throwing: DesktopAuthenticationError.cancelled)
          } else {
            continuation.resume(throwing: error ?? DesktopAuthenticationError.invalidCallback)
          }
        }
      }
      authenticationSession.presentationContextProvider = self
      authenticationSession.prefersEphemeralWebBrowserSession = false
      webAuthenticationSession = authenticationSession
      guard authenticationSession.start() else {
        webAuthenticationSession = nil
        continuation.resume(throwing: DesktopAuthenticationError.invalidCallback)
        return
      }
    }
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
    guard ticket.token.count >= 20, ticket.isValid(refreshLeewayMilliseconds: 0) else {
      throw DesktopAuthenticationError.invalidTicket
    }
    return ticket
  }
}

extension DesktopAuthenticationController: ASWebAuthenticationPresentationContextProviding {
  public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    NSApplication.shared.keyWindow
      ?? NSApplication.shared.windows.first(where: { $0.isVisible })
      ?? fallbackPresentationWindow
  }
}
