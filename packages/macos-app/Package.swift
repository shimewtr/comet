// swift-tools-version: 6.0

import PackageDescription

let package = Package(
  name: "CometOverlay",
  platforms: [
    .macOS(.v14)
  ],
  products: [
    .library(name: "CometOverlayCore", targets: ["CometOverlayCore"]),
    .library(name: "CometOverlayUI", targets: ["CometOverlayUI"]),
    .executable(name: "CometOverlay", targets: ["CometOverlay"]),
  ],
  targets: [
    .target(name: "CometOverlayCore"),
    .target(
      name: "CometOverlayUI",
      dependencies: ["CometOverlayCore"]
    ),
    .executableTarget(
      name: "CometOverlay",
      dependencies: ["CometOverlayCore", "CometOverlayUI"]
    ),
    .testTarget(
      name: "CometOverlayCoreTests",
      dependencies: ["CometOverlayCore"]
    ),
    .testTarget(
      name: "CometOverlayUITests",
      dependencies: ["CometOverlayCore", "CometOverlayUI"]
    ),
  ]
)
