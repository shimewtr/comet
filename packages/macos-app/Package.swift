// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "CometOverlay",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(name: "CometOverlayCore", targets: ["CometOverlayCore"]),
    .executable(name: "CometOverlay", targets: ["CometOverlay"]),
  ],
  targets: [
    .target(name: "CometOverlayCore"),
    .executableTarget(
      name: "CometOverlay",
      dependencies: ["CometOverlayCore"]
    ),
    .testTarget(
      name: "CometOverlayCoreTests",
      dependencies: ["CometOverlayCore"]
    ),
  ]
)
