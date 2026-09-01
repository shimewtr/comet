import Foundation

public enum PresentationPollStatus: String, Codable, Equatable, Sendable {
  case active
  case ended
}

public struct PresentationPollOption: Codable, Equatable, Sendable, Identifiable {
  public var id: String
  public var emojiId: String
  public var emoji: String
  public var label: String

  public init(id: String = UUID().uuidString, emojiId: String, emoji: String, label: String) {
    self.id = id
    self.emojiId = emojiId
    self.emoji = emoji
    self.label = label
  }
}

public struct PresentationPollResult: Codable, Equatable, Sendable {
  public var optionId: String
  public var count: Int
  public var percentage: Double

  public init(optionId: String, count: Int, percentage: Double) {
    self.optionId = optionId
    self.count = count
    self.percentage = percentage
  }
}

public struct PresentationPoll: Codable, Equatable, Sendable, Identifiable {
  public var id: String
  public var roomId: String
  public var title: String
  public var options: [PresentationPollOption]
  public var status: PresentationPollStatus
  public var startsAt: Int64
  public var endsAt: Int64
  public var totalVotes: Int
  public var results: [PresentationPollResult]?

  public init(
    id: String,
    roomId: String,
    title: String,
    options: [PresentationPollOption],
    status: PresentationPollStatus,
    startsAt: Int64,
    endsAt: Int64,
    totalVotes: Int,
    results: [PresentationPollResult]? = nil
  ) {
    self.id = id
    self.roomId = roomId
    self.title = title
    self.options = options
    self.status = status
    self.startsAt = startsAt
    self.endsAt = endsAt
    self.totalVotes = totalVotes
    self.results = results
  }
}

public struct StartPresentationPollPayload: Codable, Equatable, Sendable {
  public var controllerId: String
  public var title: String
  public var options: [PresentationPollOption]
  public var durationSeconds: Int

  public init(
    controllerId: String,
    title: String,
    options: [PresentationPollOption],
    durationSeconds: Int
  ) {
    self.controllerId = controllerId
    self.title = title
    self.options = options
    self.durationSeconds = durationSeconds
  }
}

public struct PresentationPollControlPayload: Codable, Equatable, Sendable {
  public var pollId: String
  public var controllerId: String

  public init(pollId: String, controllerId: String) {
    self.pollId = pollId
    self.controllerId = controllerId
  }
}

public struct PresentationPollStatePayload: Codable, Equatable, Sendable {
  public var poll: PresentationPoll?

  public init(poll: PresentationPoll?) {
    self.poll = poll
  }
}

public struct PresentationPollDraft: Equatable, Sendable {
  public static let defaultOptions = [
    ("1️⃣", "選択肢1"),
    ("2️⃣", "選択肢2"),
    ("3️⃣", "選択肢3"),
    ("4️⃣", "選択肢4"),
  ]

  public var title: String
  public var options: [PresentationPollOption]
  public var durationSeconds: Int

  public init(
    title: String = "",
    options: [PresentationPollOption] = Self.defaultOptions.map { emoji, label in
      PresentationPollOption(
        emojiId: Self.emojiID(for: emoji),
        emoji: emoji,
        label: label
      )
    },
    durationSeconds: Int = 30
  ) {
    self.title = title
    self.options = options
    self.durationSeconds = durationSeconds
  }

  public static func emojiID(for emoji: String) -> String {
    let codePoints = emoji.unicodeScalars.map { scalar in
      let codePoint = String(scalar.value, radix: 16)
      return codePoint.count < 4
        ? String(repeating: "0", count: 4 - codePoint.count) + codePoint
        : codePoint
    }.joined(separator: "-")
    return "emoji-\(codePoints)"
  }

  public var isValid: Bool {
    guard (2...8).contains(options.count), (10...600).contains(durationSeconds) else {
      return false
    }
    let ids = options.map {
      Self.emojiID(for: $0.emoji.trimmingCharacters(in: .whitespacesAndNewlines))
    }
    return options.allSatisfy {
      !$0.emoji.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && !$0.label.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        && $0.label.count <= 30
    } && Set(ids).count == ids.count && title.count <= 80
  }
}
