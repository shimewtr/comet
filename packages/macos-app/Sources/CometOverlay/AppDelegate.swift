import AppKit
import CometOverlayCore
import CometOverlayUI
import OSLog

final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    NSApplication.shared.setActivationPolicy(.accessory)
    AppLog.lifecycle.notice(
      "Comet started: \(AppMetadata.versionDescription, privacy: .public)")
  }

  func applicationWillTerminate(_ notification: Notification) {
    AppLog.lifecycle.notice("Comet terminated normally")
  }

  func application(_ application: NSApplication, open urls: [URL]) {
    for url in urls where url.scheme == DesktopAuthURLBuilder.callbackScheme {
      DesktopAuthenticationCallbackBroker.shared.receive(url)
    }
  }
}
