public struct RecentCommentList: Equatable, Sendable {
  public static let defaultCapacity = 12

  public private(set) var comments: [CometComment]
  public let capacity: Int

  public init(comments: [CometComment] = [], capacity: Int = Self.defaultCapacity) {
    self.capacity = max(1, capacity)
    self.comments = Array(comments.suffix(self.capacity))
  }

  public mutating func append(_ comment: CometComment) {
    comments.append(comment)
    if comments.count > capacity {
      comments.removeFirst(comments.count - capacity)
    }
  }
}
