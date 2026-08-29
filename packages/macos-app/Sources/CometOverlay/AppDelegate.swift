import AppKit
import OSLog

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApplication.shared.setActivationPolicy(.accessory)
    AppLog.lifecycle.notice(
      "Comet Overlay started: \(AppMetadata.versionDescription, privacy: .public)")
  }

  func applicationWillTerminate(_ notification: Notification) {
    AppLog.lifecycle.notice("Comet Overlay terminated normally")
  }
}
