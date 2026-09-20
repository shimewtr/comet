import CometOverlayCore
import Foundation

public actor InMemoryAuthTicketStore: AuthTicketStoring {
  private var ticketsByOrigin: [String: AuthTicket] = [:]

  public init() {}

  public func load(for origin: String) async throws -> AuthTicket? {
    ticketsByOrigin[origin]
  }

  public func save(_ ticket: AuthTicket, for origin: String) async throws {
    ticketsByOrigin[origin] = ticket
  }

  public func remove(for origin: String) async throws {
    ticketsByOrigin.removeValue(forKey: origin)
  }
}
