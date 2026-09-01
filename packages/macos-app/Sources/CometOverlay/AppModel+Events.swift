import CometOverlayCore

extension AppModel {
  func observeEvents() {
    let events = messageStream.events
    eventsTask = Task { [weak self] in
      for await event in events {
        guard !Task.isCancelled else { return }
        self?.handle(event)
      }
    }
  }

  private func handle(_ event: CometClientEvent) {
    switch event {
    case .connectionState(let state):
      connectionState = state
    case .message(.rooms(let updatedRooms)):
      rooms = updatedRooms.isEmpty ? [.global] : updatedRooms
    case .message(.roomJoined(let room)):
      settings.selectedRoomID = room.id
      if !rooms.contains(where: { $0.id == room.id }) { rooms.append(room) }
    case .message(.serverError(let payload)):
      if let fallbackRoom = payload.fallbackRoom { settings.selectedRoomID = fallbackRoom.id }
      if payload.code.rawValue.hasPrefix("POLL_") { pollMessage = payload.message }
    case .message(.comment(let comment, _)):
      overlayPresenter.show(comment: comment, placement: .scrolling)
    case .message(.stamp(let stamp, _)):
      overlayPresenter.show(stamp: stamp)
    case .message(.pollState(let updatedPoll, let roomID)):
      guard roomID == nil || roomID == settings.selectedRoomID else { return }
      poll = updatedPoll
      if updatedPoll != nil { isPreparingPoll = false }
      if let updatedPoll, updatedPoll.status == .active, isAwaitingPollStart {
        settings.controlledPollID = updatedPoll.id
        isAwaitingPollStart = false
      }
      if updatedPoll == nil {
        settings.controlledPollID = nil
        requestedPollEndID = nil
        isAwaitingPollStart = false
      }
      applyPollConfiguration()
    default:
      break
    }
  }
}
