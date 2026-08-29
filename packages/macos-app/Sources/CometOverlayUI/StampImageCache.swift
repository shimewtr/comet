import Foundation

public enum StampImageError: Error, Equatable, Sendable {
  case invalidURL
  case requestFailed
  case responseTooLarge
}

public actor StampImageCache {
  public static let shared = StampImageCache()

  private let maximumEntryCount: Int
  private let maximumResponseBytes: Int
  private var cache: [URL: Data] = [:]
  private var insertionOrder: [URL] = []

  public init(maximumEntryCount: Int = 100, maximumResponseBytes: Int = 5_000_000) {
    self.maximumEntryCount = max(1, maximumEntryCount)
    self.maximumResponseBytes = max(1, maximumResponseBytes)
  }

  public nonisolated static func isAllowedImageURL(_ url: URL) -> Bool {
    url.scheme?.lowercased() == "https"
      && url.host?.lowercased().hasSuffix(".cloudfront.net") == true
  }

  public func data(for url: URL, session: URLSession = .shared) async throws -> Data {
    guard Self.isAllowedImageURL(url) else {
      throw StampImageError.invalidURL
    }
    if let cached = cache[url] { return cached }

    var request = URLRequest(url: url)
    request.cachePolicy = .returnCacheDataElseLoad
    let (data, response) = try await session.data(for: request)
    guard let response = response as? HTTPURLResponse, (200..<300).contains(response.statusCode)
    else {
      throw StampImageError.requestFailed
    }
    guard data.count <= maximumResponseBytes else {
      throw StampImageError.responseTooLarge
    }

    cache[url] = data
    insertionOrder.append(url)
    while insertionOrder.count > maximumEntryCount {
      cache.removeValue(forKey: insertionOrder.removeFirst())
    }
    return data
  }
}
