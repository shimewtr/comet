import Foundation
import OSLog

enum AppMetadata {
  static var versionDescription: String {
    let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
    let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String
    guard let version, let build else { return "開発版" }
    return "バージョン \(version) (\(build))"
  }
}

enum AppLog {
  private static let subsystem = Bundle.main.bundleIdentifier ?? "com.shimewtr.comet.overlay"

  static let lifecycle = Logger(subsystem: subsystem, category: "lifecycle")
  static let connection = Logger(subsystem: subsystem, category: "connection")

  static func errorType(_ error: any Error) -> String {
    String(reflecting: type(of: error))
  }
}
