public struct CommentListPresentation: Equatable, Sendable {
  public static let maximumVisibleComments = 8

  public let comments: [CometComment]

  public init(comments: [CometComment]) {
    self.comments = comments
  }

  public var visibleComments: [CometComment] {
    Array(comments.suffix(Self.maximumVisibleComments))
  }

  public var isEmpty: Bool { comments.isEmpty }
}
