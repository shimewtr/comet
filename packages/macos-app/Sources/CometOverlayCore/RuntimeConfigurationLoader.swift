import Foundation

public enum RuntimeConfigurationError: Error, Equatable, LocalizedError, Sendable {
  case invalidWebAppURL
  case requestFailed(statusCode: Int)
  case missingWebSocketURL
  case invalidWebSocketURL

  public var errorDescription: String? {
    switch self {
    case .invalidWebAppURL:
      "WebアプリURLはhttpまたはhttpsで指定してください"
    case .requestFailed(let statusCode):
      "接続設定の取得に失敗しました（HTTP \(statusCode)）"
    case .missingWebSocketURL:
      "WebSocket URLが設定されていません"
    case .invalidWebSocketURL:
      "WebSocket URLはwsまたはwssで指定してください"
    }
  }
}

public protocol HTTPDataLoading: Sendable {
  func data(from url: URL) async throws -> (Data, HTTPURLResponse)
}

public actor URLSessionHTTPDataLoader: HTTPDataLoading {
  private let session: URLSession

  public init(session: URLSession = .shared) {
    self.session = session
  }

  public func data(from url: URL) async throws -> (Data, HTTPURLResponse) {
    var request = URLRequest(url: url)
    request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
    let (data, response) = try await session.data(for: request)
    guard let httpResponse = response as? HTTPURLResponse else {
      throw RuntimeConfigurationError.requestFailed(statusCode: 0)
    }
    return (data, httpResponse)
  }
}

public struct RuntimeConfigurationLoader: RuntimeConfigurationProviding, Sendable {
  private struct WireConfiguration: Decodable {
    let websocketUrl: String?
    let historyApiUrl: String?
    let authEnabled: Bool?
  }

  private let loader: any HTTPDataLoading

  public init(loader: any HTTPDataLoading = URLSessionHTTPDataLoader()) {
    self.loader = loader
  }

  public func configuration(for webAppURL: URL) async throws -> RuntimeConfiguration {
    guard let scheme = webAppURL.scheme?.lowercased(), ["http", "https"].contains(scheme),
      webAppURL.host != nil
    else {
      throw RuntimeConfigurationError.invalidWebAppURL
    }

    let configURL = webAppURL.appendingPathComponent("comet-config.json")
    let (data, response) = try await loader.data(from: configURL)
    guard (200..<300).contains(response.statusCode) else {
      throw RuntimeConfigurationError.requestFailed(statusCode: response.statusCode)
    }

    let wire = try JSONDecoder().decode(WireConfiguration.self, from: data)
    guard let websocketValue = wire.websocketUrl, !websocketValue.isEmpty else {
      throw RuntimeConfigurationError.missingWebSocketURL
    }
    guard let websocketURL = URL(string: websocketValue),
      let websocketScheme = websocketURL.scheme?.lowercased(),
      ["ws", "wss"].contains(websocketScheme), websocketURL.host != nil
    else {
      throw RuntimeConfigurationError.invalidWebSocketURL
    }

    let historyAPIURL = wire.historyApiUrl.flatMap { value in
      value.isEmpty ? nil : URL(string: value)
    }
    return RuntimeConfiguration(
      websocketURL: websocketURL,
      historyAPIURL: historyAPIURL,
      authEnabled: wire.authEnabled ?? false
    )
  }
}
