import Foundation
import Testing

@testable import CometOverlayCore

private actor StubHTTPDataLoader: HTTPDataLoading {
  private let data: Data
  private let statusCode: Int
  private(set) var requestedURL: URL?

  init(json: String, statusCode: Int = 200) {
    data = Data(json.utf8)
    self.statusCode = statusCode
  }

  func data(from url: URL) async throws -> (Data, HTTPURLResponse) {
    requestedURL = url
    let response = try #require(
      HTTPURLResponse(url: url, statusCode: statusCode, httpVersion: nil, headerFields: nil)
    )
    return (data, response)
  }
}

@Test
func loadsRuntimeConfigurationFromWebApp() async throws {
  let loader = StubHTTPDataLoader(
    json: """
      {
        "websocketUrl": "wss://socket.example.com/dev",
        "historyApiUrl": "https://history.example.com/dev",
        "authEnabled": true
      }
      """
  )
  let provider = RuntimeConfigurationLoader(loader: loader)

  let configuration = try await provider.configuration(
    for: try #require(URL(string: "https://comet.example.com/app/"))
  )

  #expect(
    await loader.requestedURL?.absoluteString == "https://comet.example.com/app/comet-config.json")
  #expect(configuration.websocketURL.absoluteString == "wss://socket.example.com/dev")
  #expect(configuration.historyAPIURL?.absoluteString == "https://history.example.com/dev")
  #expect(configuration.authEnabled)
}

@Test
func rejectsMissingOrInvalidWebSocketURL() async throws {
  let missingProvider = RuntimeConfigurationLoader(
    loader: StubHTTPDataLoader(json: #"{"authEnabled":false}"#)
  )
  do {
    _ = try await missingProvider.configuration(
      for: try #require(URL(string: "https://comet.example.com"))
    )
    Issue.record("Expected a missing WebSocket URL error")
  } catch let error as RuntimeConfigurationError {
    #expect(error == .missingWebSocketURL)
  }

  let invalidProvider = RuntimeConfigurationLoader(
    loader: StubHTTPDataLoader(json: #"{"websocketUrl":"https://socket.example.com"}"#)
  )
  do {
    _ = try await invalidProvider.configuration(
      for: try #require(URL(string: "https://comet.example.com"))
    )
    Issue.record("Expected an invalid WebSocket URL error")
  } catch let error as RuntimeConfigurationError {
    #expect(error == .invalidWebSocketURL)
  }
}

@Test
func rejectsNonHTTPWebAppURLBeforeRequestingConfiguration() async throws {
  let loader = StubHTTPDataLoader(json: "{}")
  let provider = RuntimeConfigurationLoader(loader: loader)

  do {
    _ = try await provider.configuration(
      for: try #require(URL(string: "file:///tmp/comet"))
    )
    Issue.record("Expected an invalid Web app URL error")
  } catch let error as RuntimeConfigurationError {
    #expect(error == .invalidWebAppURL)
  }

  #expect(await loader.requestedURL == nil)
}
