import Testing

@testable import CometOverlayUI

@Test
func participationQRCodeGeneratesAnImageForAWebURL() {
  let image = ParticipationQRCode.image(for: "https://comet.example.com")

  #expect(image != nil)
  #expect(image?.size.width == 140)
  #expect(image?.size.height == 140)
}

@Test
func participationQRCodeRejectsEmptyValues() {
  #expect(ParticipationQRCode.image(for: "") == nil)
}
