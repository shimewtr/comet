import CometOverlayCore
import Foundation
import Security

public actor KeychainAuthTicketStore: AuthTicketStoring {
  private let service: String

  public init(service: String = "com.shimewtr.comet.macos.auth-ticket") {
    self.service = service
  }

  public func load(for origin: String) async throws -> AuthTicket? {
    var query = baseQuery(origin: origin)
    query[kSecReturnData as String] = true
    query[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess, let data = result as? Data else {
      throw DesktopAuthenticationError.keychain(status: status)
    }
    return try JSONDecoder().decode(AuthTicket.self, from: data)
  }

  public func save(_ ticket: AuthTicket, for origin: String) async throws {
    let data = try JSONEncoder().encode(ticket)
    let query = baseQuery(origin: origin)
    let attributes: [String: Any] = [kSecValueData as String: data]
    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
    if updateStatus == errSecSuccess { return }
    guard updateStatus == errSecItemNotFound else {
      throw DesktopAuthenticationError.keychain(status: updateStatus)
    }

    var item = query
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    let addStatus = SecItemAdd(item as CFDictionary, nil)
    guard addStatus == errSecSuccess else {
      throw DesktopAuthenticationError.keychain(status: addStatus)
    }
  }

  public func remove(for origin: String) async throws {
    let status = SecItemDelete(baseQuery(origin: origin) as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw DesktopAuthenticationError.keychain(status: status)
    }
  }

  private func baseQuery(origin: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: origin,
    ]
  }
}
