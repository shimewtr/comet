import Foundation

public enum ParticipationURLBuilder {
  public static func url(webAppURL: String, roomID: String) -> URL? {
    let value = webAppURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard var components = URLComponents(string: value),
      ["http", "https"].contains(components.scheme?.lowercased() ?? ""),
      components.host != nil
    else { return nil }

    var queryItems = components.queryItems ?? []
    queryItems.removeAll { $0.name == "room" }
    if roomID != AppSettings.defaultRoomID {
      queryItems.append(URLQueryItem(name: "room", value: roomID))
    }
    components.queryItems = queryItems.isEmpty ? nil : queryItems
    return components.url
  }
}
