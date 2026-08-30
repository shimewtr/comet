import AppKit
import CometOverlayCore
import CoreImage
import SwiftUI

public enum ParticipationQRCode {
  public static func image(for value: String, size: CGFloat = 140) -> NSImage? {
    guard !value.isEmpty,
      let data = value.data(using: .utf8),
      let filter = CIFilter(name: "CIQRCodeGenerator")
    else { return nil }

    filter.setValue(data, forKey: "inputMessage")
    filter.setValue("M", forKey: "inputCorrectionLevel")
    guard let output = filter.outputImage else { return nil }

    let scale = max(1, floor(size / output.extent.width))
    let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
    return NSImage(cgImage: cgImage, size: NSSize(width: size, height: size))
  }
}

@MainActor
public final class ParticipationQRWindowManager: NSObject {
  private struct Configuration: Equatable {
    let isEnabled: Bool
    let webAppURL: String
    let roomID: String
    let selectedDisplayID: String?
  }

  private var windows: [CGDirectDisplayID: NSPanel] = [:]
  private var configuration: Configuration?

  public override init() {
    super.init()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(screenParametersDidChange),
      name: NSApplication.didChangeScreenParametersNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
  }

  public func apply(
    isEnabled: Bool,
    webAppURL: String,
    roomID: String,
    selectedDisplayID: String?
  ) {
    let updatedConfiguration = Configuration(
      isEnabled: isEnabled,
      webAppURL: webAppURL.trimmingCharacters(in: .whitespacesAndNewlines),
      roomID: roomID,
      selectedDisplayID: selectedDisplayID
    )
    guard updatedConfiguration != configuration else { return }
    configuration = updatedConfiguration
    refreshWindows()
  }

  @objc private func screenParametersDidChange() {
    refreshWindows()
  }

  private func refreshWindows() {
    for window in windows.values {
      window.orderOut(nil)
    }
    windows.removeAll()

    guard let configuration,
      configuration.isEnabled,
      let url = ParticipationURLBuilder.url(
        webAppURL: configuration.webAppURL,
        roomID: configuration.roomID
      ),
      let image = ParticipationQRCode.image(for: url.absoluteString)
    else { return }

    for screen in selectedScreens() {
      let window = makeWindow(image: image, on: screen)
      windows[ScreenIdentity.directDisplayID(for: screen)] = window
      window.orderFrontRegardless()
    }
  }

  private func selectedScreens() -> [NSScreen] {
    guard let selectedDisplayID = configuration?.selectedDisplayID else { return NSScreen.screens }
    if let screen = NSScreen.screens.first(where: {
      ScreenIdentity.stableDisplayID(for: $0) == selectedDisplayID
    }) {
      return [screen]
    }
    return NSScreen.main.map { [$0] } ?? []
  }

  private func makeWindow(image: NSImage, on screen: NSScreen) -> NSPanel {
    let size = NSSize(width: 172, height: 184)
    let origin = NSPoint(x: screen.frame.maxX - size.width - 16, y: screen.frame.minY + 16)
    let window = NSPanel(
      contentRect: NSRect(origin: origin, size: size),
      styleMask: [.borderless, .nonactivatingPanel],
      backing: .buffered,
      defer: false,
      screen: screen
    )
    OverlayWindowPolicy.presentation.apply(to: window)
    window.contentView = NSHostingView(rootView: ParticipationQRView(image: image))
    window.setFrameOrigin(origin)
    return window
  }

}

private struct ParticipationQRView: View {
  let image: NSImage

  var body: some View {
    VStack(spacing: 4) {
      Image(nsImage: image)
        .interpolation(.none)
        .resizable()
        .frame(width: 140, height: 140)
      Text("コメント投稿はこちら")
        .font(.system(size: 11))
        .foregroundStyle(Color(nsColor: .darkGray))
    }
    .padding(8)
    .background(.white.opacity(0.95), in: RoundedRectangle(cornerRadius: 8))
    .shadow(color: .black.opacity(0.3), radius: 4, y: 2)
    .padding(8)
  }
}
