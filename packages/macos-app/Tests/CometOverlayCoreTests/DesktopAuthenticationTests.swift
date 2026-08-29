import Foundation
import Testing

@testable import CometOverlayCore

@Test
func desktopAuthorizationRequestUsesPKCEAndRandomState() throws {
  let request = try DesktopAuthorizationRequest()

  #expect(request.state.count == 43)
  #expect(request.verifier.count == 43)
  #expect(request.challenge.count == 43)
  #expect(request.state.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" })
}

@Test
func desktopAuthorizationRequestMatchesRFC7636Challenge() {
  let request = DesktopAuthorizationRequest(
    state: String(repeating: "s", count: 43),
    verifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  )

  #expect(request.challenge == "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM")
}

@Test
func desktopAuthURLsAreFixedToConfiguredWebOrigin() throws {
  let webAppURL = try #require(
    URL(string: "https://comet.example.com:8443/app?unsafe=value#unsafe-fragment")
  )
  let request = DesktopAuthorizationRequest(
    state: String(repeating: "s", count: 43),
    verifier: String(repeating: "v", count: 43)
  )

  let loginURL = try DesktopAuthURLBuilder.loginURL(webAppURL: webAppURL, request: request)
  let exchangeURL = try DesktopAuthURLBuilder.exchangeURL(webAppURL: webAppURL)
  let logoutURL = try DesktopAuthURLBuilder.logoutURL(webAppURL: webAppURL)

  #expect(loginURL.scheme == "https")
  #expect(loginURL.host == "comet.example.com")
  #expect(loginURL.port == 8443)
  #expect(loginURL.path == "/auth/desktop")
  #expect(loginURL.query?.contains("unsafe") == false)
  #expect(loginURL.fragment == nil)
  #expect(exchangeURL.absoluteString == "https://comet.example.com:8443/auth/desktop/token")
  #expect(logoutURL.absoluteString == "https://comet.example.com:8443/auth/logout?desktop=1")
  #expect(try DesktopAuthURLBuilder.origin(for: webAppURL) == "https://comet.example.com:8443")
}

@Test
func desktopLogoutCallbackMustUseFixedURL() throws {
  let validURL = try #require(URL(string: "comet-overlay://auth/logout"))
  try DesktopAuthURLBuilder.validateLogoutCallback(validURL)

  let invalidURL = try #require(URL(string: "comet-overlay://auth/logout?next=https://evil.test"))
  #expect(throws: DesktopAuthenticationError.invalidCallback) {
    try DesktopAuthURLBuilder.validateLogoutCallback(invalidURL)
  }
}

@Test
func desktopCallbackRequiresFixedSchemePathAndMatchingState() throws {
  let state = String(repeating: "s", count: 43)
  let validURL = try #require(
    URL(string: "comet-overlay://auth/callback?state=\(state)&code=valid-authorization-code")
  )

  #expect(
    try DesktopAuthURLBuilder.authorizationCode(callbackURL: validURL, expectedState: state)
      == "valid-authorization-code"
  )

  let wrongScheme = try #require(
    URL(string: "https://auth/callback?state=\(state)&code=valid-authorization-code")
  )
  #expect(throws: DesktopAuthenticationError.invalidCallback) {
    try DesktopAuthURLBuilder.authorizationCode(callbackURL: wrongScheme, expectedState: state)
  }

  let wrongState = try #require(
    URL(string: "comet-overlay://auth/callback?state=wrong&code=valid-authorization-code")
  )
  #expect(throws: DesktopAuthenticationError.stateMismatch) {
    try DesktopAuthURLBuilder.authorizationCode(callbackURL: wrongState, expectedState: state)
  }
}

@Test
func authenticatedWebSocketURLReplacesExistingTicket() throws {
  let baseURL = try #require(URL(string: "wss://socket.example.com/dev?token=old&mode=test"))
  let ticket = AuthTicket(token: "new-ticket", expiresAt: Int64.max)

  let url = try DesktopAuthURLBuilder.authenticatedWebSocketURL(
    baseURL: baseURL,
    ticket: ticket
  )
  let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
  let tokenItems = components.queryItems?.filter { $0.name == "token" }

  #expect(tokenItems == [URLQueryItem(name: "token", value: "new-ticket")])
  #expect(components.queryItems?.contains(URLQueryItem(name: "mode", value: "test")) == true)
}

@Test
func authTicketUsesRefreshLeeway() {
  let now = Date(timeIntervalSince1970: 1_000)
  let ticket = AuthTicket(token: "ticket", expiresAt: 1_070_000)

  #expect(ticket.isValid(at: now))
  #expect(!ticket.isValid(at: now.addingTimeInterval(11)))
  #expect(ticket.isValid(at: now.addingTimeInterval(11), refreshLeewayMilliseconds: 0))
}
