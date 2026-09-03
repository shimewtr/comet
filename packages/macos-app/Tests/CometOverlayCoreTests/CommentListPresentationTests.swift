import Testing

@testable import CometOverlayCore

@Test
func commentListPresentationShowsOnlyTheNewestEightComments() {
  let comments = (0..<10).map { index in
    CometComment(
      id: "\(index)", content: "\(index)", timestamp: Int64(index),
      style: CommentStyle(color: "#fff", size: .medium))
  }
  let presentation = CommentListPresentation(comments: comments)

  #expect(presentation.visibleComments.map(\.id) == ["2", "3", "4", "5", "6", "7", "8", "9"])
}
