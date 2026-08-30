import AppKit

enum ScreenIdentity {
  static func directDisplayID(for screen: NSScreen) -> CGDirectDisplayID {
    (screen.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.uint32Value
      ?? 0
  }

  static func stableDisplayID(for screen: NSScreen) -> String {
    let displayID = directDisplayID(for: screen)
    guard let displayUUID = CGDisplayCreateUUIDFromDisplayID(displayID)?.takeRetainedValue()
    else { return "display-\(displayID)" }
    return CFUUIDCreateString(nil, displayUUID) as String
  }
}
