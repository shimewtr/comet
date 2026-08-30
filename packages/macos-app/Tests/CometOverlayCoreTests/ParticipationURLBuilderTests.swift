import Testing

@testable import CometOverlayCore

@Test
func participationURLIncludesTheSelectedRoom() {
  let url = ParticipationURLBuilder.url(
    webAppURL: "https://comet.example.com/?source=mac",
    roomID: "room 1"
  )

  #expect(url?.absoluteString == "https://comet.example.com/?source=mac&room=room%201")
}

@Test
func participationURLRemovesRoomForTheGlobalRoom() {
  let url = ParticipationURLBuilder.url(
    webAppURL: "https://comet.example.com/?room=old",
    roomID: AppSettings.defaultRoomID
  )

  #expect(url?.absoluteString == "https://comet.example.com/")
}

@Test
func participationURLRejectsUnsupportedURLs() {
  #expect(ParticipationURLBuilder.url(webAppURL: "file:///tmp/comet", roomID: "room-1") == nil)
  #expect(ParticipationURLBuilder.url(webAppURL: "not a url", roomID: "room-1") == nil)
}
