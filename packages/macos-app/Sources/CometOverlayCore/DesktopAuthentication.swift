import CryptoKit
import Foundation
import Security

public struct AuthTicket: Codable, Equatable, Sendable {
  public let token: String
  public let expiresAt: Int64

  public init(token: String, expiresAt: Int64) {
    self.token = token
    self.expiresAt = expiresAt
  }

  public func isValid(at date: Date = Date(), refreshLeewayMilliseconds: Int64 = 60_000) -> Bool {
    !token.isEmpty
      && expiresAt - refreshLeewayMilliseconds > Int64(date.timeIntervalSince1970 * 1_000)
  }
}

public struct DesktopAuthorizationRequest: Equatable, Sendable {
  public let state: String
  public let verifier: String
  public let challenge: String

  public init() throws {
    let stateData = try Self.randomData(count: 32)
    let verifierData = try Self.randomData(count: 32)
    state = Self.base64URL(stateData)
    verifier = Self.base64URL(verifierData)
    challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
  }

  public init(state: String, verifier: String) {
    self.state = state
    self.verifier = verifier
    challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
  }

  private static func randomData(count: Int) throws -> Data {
    var bytes = [UInt8](repeating: 0, count: count)
    let status = bytes.withUnsafeMutableBytes { buffer in
      SecRandomCopyBytes(kSecRandomDefault, count, buffer.baseAddress!)
    }
    guard status == errSecSuccess else {
      throw DesktopAuthenticationError.randomGenerationFailed
    }
    return Data(bytes)
  }

  private static func base64URL(_ data: Data) -> String {
    data.base64EncodedString()
      .replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_")
      .replacingOccurrences(of: "=", with: "")
  }
}

public enum DesktopAuthenticationError: Error, Equatable, LocalizedError, Sendable {
  case randomGenerationFailed
  case invalidWebAppURL
  case invalidCallback
  case stateMismatch
  case missingAuthorizationCode
  case exchangeFailed(statusCode: Int)
  case invalidTicket
  case cancelled
  case keychain(status: Int32)

  public var errorDescription: String? {
    switch self {
    case .randomGenerationFailed:
      "安全な認証リクエストを生成できませんでした"
    case .invalidWebAppURL:
      "認証先WebアプリURLが正しくありません"
    case .invalidCallback:
      "認証callbackが正しくありません"
    case .stateMismatch:
      "認証stateが一致しません"
    case .missingAuthorizationCode:
      "認証コードを取得できませんでした"
    case .exchangeFailed(let statusCode):
      "認証チケットの取得に失敗しました（HTTP \(statusCode)）"
    case .invalidTicket:
      "認証チケットが正しくありません"
    case .cancelled:
      "ログインをキャンセルしました"
    case .keychain(let status):
      "Keychainの操作に失敗しました（\(status)）"
    }
  }
}

public enum DesktopAuthURLBuilder {
  public static let callbackScheme = "comet-overlay"

  public static func loginURL(
    webAppURL: URL,
    request: DesktopAuthorizationRequest
  ) throws -> URL {
    var components = try webComponents(for: webAppURL)
    components.path = "/auth/desktop"
    components.queryItems = [
      URLQueryItem(name: "state", value: request.state),
      URLQueryItem(name: "code_challenge", value: request.challenge),
    ]
    guard let url = components.url else { throw DesktopAuthenticationError.invalidWebAppURL }
    return url
  }

  public static func exchangeURL(webAppURL: URL) throws -> URL {
    var components = try webComponents(for: webAppURL)
    components.path = "/auth/desktop/token"
    components.query = nil
    guard let url = components.url else { throw DesktopAuthenticationError.invalidWebAppURL }
    return url
  }

  public static func logoutURL(webAppURL: URL) throws -> URL {
    var components = try webComponents(for: webAppURL)
    components.path = "/auth/logout"
    components.queryItems = [URLQueryItem(name: "desktop", value: "1")]
    guard let url = components.url else { throw DesktopAuthenticationError.invalidWebAppURL }
    return url
  }

  public static func origin(for webAppURL: URL) throws -> String {
    let components = try webComponents(for: webAppURL)
    guard let host = components.host, let scheme = components.scheme else {
      throw DesktopAuthenticationError.invalidWebAppURL
    }
    let port = components.port.map { ":\($0)" } ?? ""
    return "\(scheme)://\(host)\(port)"
  }

  public static func authorizationCode(
    callbackURL: URL,
    expectedState: String
  ) throws -> String {
    guard
      callbackURL.scheme == callbackScheme,
      callbackURL.host == "auth",
      callbackURL.path == "/callback",
      let components = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)
    else {
      throw DesktopAuthenticationError.invalidCallback
    }
    let state = components.queryItems?.first { $0.name == "state" }?.value
    guard state == expectedState else { throw DesktopAuthenticationError.stateMismatch }
    guard let code = components.queryItems?.first(where: { $0.name == "code" })?.value,
      code.count >= 20
    else {
      throw DesktopAuthenticationError.missingAuthorizationCode
    }
    return code
  }

  public static func validateLogoutCallback(_ callbackURL: URL) throws {
    guard
      callbackURL.scheme == callbackScheme,
      callbackURL.host == "auth",
      callbackURL.path == "/logout",
      callbackURL.query == nil,
      callbackURL.fragment == nil
    else {
      throw DesktopAuthenticationError.invalidCallback
    }
  }

  public static func authenticatedWebSocketURL(baseURL: URL, ticket: AuthTicket) throws -> URL {
    guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
      throw DesktopAuthenticationError.invalidWebAppURL
    }
    var queryItems = components.queryItems ?? []
    queryItems.removeAll { $0.name == "token" }
    queryItems.append(URLQueryItem(name: "token", value: ticket.token))
    components.queryItems = queryItems
    guard let url = components.url else { throw DesktopAuthenticationError.invalidWebAppURL }
    return url
  }

  private static func webComponents(for url: URL) throws -> URLComponents {
    guard var components = URLComponents(url: url, resolvingAgainstBaseURL: false),
      let scheme = components.scheme?.lowercased(), ["http", "https"].contains(scheme),
      let host = components.host?.lowercased(),
      scheme == "https" || (scheme == "http" && isLoopbackHost(host)),
      components.user == nil, components.password == nil
    else {
      throw DesktopAuthenticationError.invalidWebAppURL
    }
    components.scheme = scheme
    components.query = nil
    components.fragment = nil
    return components
  }

  private static func isLoopbackHost(_ host: String) -> Bool {
    host == "localhost" || host == "127.0.0.1" || host == "::1" || host == "[::1]"
  }
}

public protocol AuthTicketStoring: Sendable {
  func load(for origin: String) async throws -> AuthTicket?
  func save(_ ticket: AuthTicket, for origin: String) async throws
  func remove(for origin: String) async throws
}

@MainActor
public protocol DesktopAuthenticating: AnyObject {
  func validTicket(for webAppURL: URL) async throws -> AuthTicket?
  func authenticate(webAppURL: URL) async throws -> AuthTicket
  func logout(webAppURL: URL) async throws
}
