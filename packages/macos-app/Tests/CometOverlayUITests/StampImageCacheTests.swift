import Foundation
import Testing

@testable import CometOverlayUI

@Test
func stampImageCacheOnlyAllowsHTTPSCloudFrontURLs() throws {
  #expect(
    StampImageCache.isAllowedImageURL(
      try #require(URL(string: "https://example.cloudfront.net/stamps/clap.png"))
    )
  )
  #expect(
    !StampImageCache.isAllowedImageURL(
      try #require(URL(string: "http://example.cloudfront.net/stamps/clap.png"))
    )
  )
  #expect(
    !StampImageCache.isAllowedImageURL(
      try #require(URL(string: "https://cloudfront.net.example.com/stamps/clap.png"))
    )
  )
}
