import Testing

@testable import CometOverlayCore

@Test
func recentCommentListKeepsTheNewestCommentsWithinItsCapacity() {
  var list = RecentCommentList(capacity: 2)
  list.append(comment(id: "one"))
  list.append(comment(id: "two"))
  list.append(comment(id: "three"))

  #expect(list.comments.map(\.id) == ["two", "three"])
}

private func comment(id: String) -> CometComment {
  CometComment(
    id: id,
    content: id,
    timestamp: 0,
    style: CommentStyle(color: "#ffffff", size: .medium)
  )
}
