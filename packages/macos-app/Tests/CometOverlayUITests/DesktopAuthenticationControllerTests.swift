import CometOverlayCore
import Foundation
import Testing

@testable import CometOverlayUI

@MainActor
@Test
func expiredAccessTicketRefreshesWithoutOpeningTheBrowser() async throws {
  let now = Int64(Date().timeIntervalSince1970 * 1_000)
  let storedTicket = AuthTicket(
    token: "expired-access-ticket",
    expiresAt: now - 1,
    refreshToken: "stored-refresh-token-with-sufficient-length",
    refreshExpiresAt: now + 60_000
  )
  let store = MemoryAuthTicketStore(ticket: storedTicket)
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [RefreshURLProtocol.self]
  let session = URLSession(configuration: configuration)
  let refreshedExpiry = now + 15 * 60 * 1_000
  RefreshURLProtocol.handler = { request in
    #expect(request.url?.path == "/auth/desktop/refresh")
    #expect(
      String(data: requestBody(request), encoding: .utf8)?.contains(
        "refresh_token=stored-refresh-token-with-sufficient-length") == true)
    let response = try #require(
      HTTPURLResponse(
        url: request.url!, statusCode: 200, httpVersion: nil,
        headerFields: ["Content-Type": "application/json"])
    )
    let body = try JSONEncoder().encode(
      AccessTicketFixture(
        token: "new-access-ticket-with-sufficient-length", expiresAt: refreshedExpiry)
    )
    return (response, body)
  }
  defer { RefreshURLProtocol.handler = nil }

  let controller = DesktopAuthenticationController(ticketStore: store, session: session)
  let ticket = try #require(
    try await controller.validTicket(for: URL(string: "https://comet.example.com")!))

  #expect(ticket.token == "new-access-ticket-with-sufficient-length")
  #expect(ticket.refreshToken == storedTicket.refreshToken)
  #expect(await store.currentTicket() == ticket)
}

private func requestBody(_ request: URLRequest) -> Data {
  if let body = request.httpBody { return body }
  guard let stream = request.httpBodyStream else { return Data() }
  stream.open()
  defer { stream.close() }
  var data = Data()
  var buffer = [UInt8](repeating: 0, count: 1_024)
  while true {
    let count = stream.read(&buffer, maxLength: buffer.count)
    if count <= 0 { break }
    data.append(buffer, count: count)
  }
  return data
}

private struct AccessTicketFixture: Encodable {
  let token: String
  let expiresAt: Int64
}

private actor MemoryAuthTicketStore: AuthTicketStoring {
  private var ticket: AuthTicket?

  init(ticket: AuthTicket?) {
    self.ticket = ticket
  }

  func load(for origin: String) async throws -> AuthTicket? { ticket }
  func save(_ ticket: AuthTicket, for origin: String) async throws { self.ticket = ticket }
  func remove(for origin: String) async throws { ticket = nil }
  func currentTicket() -> AuthTicket? { ticket }
}

private final class RefreshURLProtocol: URLProtocol, @unchecked Sendable {
  nonisolated(unsafe) static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data))?

  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

  override func startLoading() {
    guard let handler = Self.handler else {
      client?.urlProtocol(self, didFailWithError: URLError(.unknown))
      return
    }
    do {
      let (response, data) = try handler(request)
      client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
      client?.urlProtocol(self, didLoad: data)
      client?.urlProtocolDidFinishLoading(self)
    } catch {
      client?.urlProtocol(self, didFailWithError: error)
    }
  }

  override func stopLoading() {}
}
