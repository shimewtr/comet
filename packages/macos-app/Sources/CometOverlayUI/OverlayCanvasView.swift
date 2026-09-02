import AppKit
import CometOverlayCore
import SwiftUI

public struct OverlayCanvasView: View {
  @ObservedObject private var model: OverlaySceneModel

  public init(model: OverlaySceneModel) {
    self.model = model
  }

  public var body: some View {
    GeometryReader { geometry in
      ZStack(alignment: .topLeading) {
        ForEach(model.comments) { item in
          CommentOverlayView(
            item: item,
            canvasSize: geometry.size,
            settings: model.displaySettings
          )
        }
        ForEach(model.stamps) { item in
          StampOverlayView(
            item: item,
            canvasSize: geometry.size,
            settings: model.displaySettings
          )
        }
        ForEach(model.stampBursts) { item in
          StampBurstView(
            item: item,
            canvasSize: geometry.size,
            settings: model.displaySettings
          )
        }
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .clipped()
      .allowsHitTesting(false)
    }
    .background(Color.clear)
  }
}

private struct CommentOverlayView: View {
  let item: RenderedComment
  let canvasSize: CGSize
  let settings: OverlayDisplaySettings

  @State private var hasStarted = false
  @State private var isVisible = false

  var body: some View {
    let fontSize = baseFontSize * CGFloat(settings.sizeScale)
    let text = Text(item.comment.content)
      .font(.system(size: fontSize, weight: .bold))
      .foregroundStyle(Color(hex: item.comment.style.color))
      .shadow(color: .black.opacity(0.9), radius: 2, x: 1, y: 1)
      .opacity(settings.commentOpacity)

    Group {
      switch item.placement {
      case .scrolling:
        text
          .fixedSize()
          .position(
            x: hasStarted ? -estimatedWidth / 2 : canvasSize.width + estimatedWidth / 2,
            y: scrollingY(fontSize: fontSize)
          )
      case .fixedTop:
        text.position(
          x: canvasSize.width / 2,
          y: max(verticalBounds.lowerBound + fontSize / 2, canvasSize.height * 0.08)
        )
      case .fixedBottom:
        text
          .position(x: canvasSize.width / 2, y: verticalBounds.upperBound - fontSize / 2)
      }
    }
    .modifier(CommentEffect(animation: item.comment.style.animation))
    .opacity(item.placement == .scrolling && !isVisible ? 0 : 1)
    .task {
      guard item.placement == .scrolling else { return }
      try? await Task.sleep(for: .seconds(item.delay))
      guard !Task.isCancelled else { return }
      var transaction = Transaction()
      transaction.disablesAnimations = true
      withTransaction(transaction) {
        isVisible = true
      }
      await Task.yield()
      withAnimation(.linear(duration: item.duration)) {
        hasStarted = true
      }
    }
  }

  private var baseFontSize: CGFloat {
    switch item.comment.style.size {
    case .small:
      30
    case .medium:
      45
    case .large:
      60
    }
  }

  private var estimatedWidth: CGFloat {
    max(
      120,
      CGFloat(item.comment.content.count) * baseFontSize * CGFloat(settings.sizeScale) * 0.7
    )
  }

  private func scrollingY(fontSize: CGFloat) -> CGFloat {
    let visibleHeight = verticalBounds.upperBound - verticalBounds.lowerBound
    let laneHeight = max(48, fontSize * 1.35)
    let laneCount = max(1, Int(visibleHeight / laneHeight))
    return verticalBounds.lowerBound + (CGFloat(item.lane % laneCount) + 0.5) * laneHeight
  }

  private var verticalBounds: ClosedRange<CGFloat> {
    let safeInset = canvasSize.height * 0.05
    let displayAreaBottom = canvasSize.height * CGFloat(settings.displayArea.heightFraction)
    return safeInset...max(safeInset, min(displayAreaBottom, canvasSize.height - safeInset))
  }
}

private struct CommentEffect: ViewModifier {
  let animation: CommentAnimation?
  @State private var active = false

  func body(content: Content) -> some View {
    content
      .opacity(animation == .blink && active ? 0.25 : 1)
      .scaleEffect(animation == .bounce && active ? 1.12 : 1)
      .offset(x: animation == .shake && active ? 5 : 0)
      .onAppear {
        guard animation != nil, animation != CommentAnimation.none else { return }
        withAnimation(.easeInOut(duration: 0.25).repeatForever(autoreverses: true)) {
          active = true
        }
      }
  }
}

private struct StampOverlayView: View {
  let item: RenderedStamp
  let canvasSize: CGSize
  let settings: OverlayDisplaySettings

  @State private var appeared = false
  @State private var fadingOut = false
  @State private var image: NSImage?
  @State private var imageReady = false

  var body: some View {
    StampFaceView(
      stamp: item.message.stamp,
      size: size,
      image: image,
      isReady: imageReady
    )
    .frame(width: size, height: size)
    .position(x: position.x, y: position.y)
    .shadow(color: .white.opacity(0.8), radius: 10)
    .scaleEffect(appeared ? 1 : 0.82)
    .animation(.spring(response: 0.22, dampingFraction: 0.72), value: appeared)
    .opacity(appeared && !fadingOut ? settings.stampOpacity : 0)
    .animation(.easeOut(duration: 0.18), value: appeared)
    .animation(.easeOut(duration: 0.48), value: fadingOut)
    .task {
      image = await loadStampImage(for: item.message.stamp)
      imageReady = true
      await Task.yield()
      appeared = true
      try? await Task.sleep(for: .milliseconds(650))
      guard !Task.isCancelled else { return }
      fadingOut = true
    }
  }

  private var size: CGFloat { 52 * CGFloat(settings.sizeScale) }

  private var position: CGPoint {
    let safeInset = canvasSize.height * 0.05
    let displayAreaBottom = canvasSize.height * CGFloat(settings.displayArea.heightFraction)
    let bottom = max(safeInset, min(displayAreaBottom, canvasSize.height - safeInset))
    let topCenter = min(bottom, safeInset + size / 2)
    let bottomCenter = max(topCenter, bottom - size / 2)
    let normalizedY = CGFloat(min(max(item.position.y, 0), 1))
    return CGPoint(
      x: CGFloat(min(max(item.position.x, 0.05), 0.95)) * canvasSize.width,
      y: topCenter + normalizedY * (bottomCenter - topCenter)
    )
  }
}

private struct StampBurstView: View {
  let item: RenderedStampBurst
  let canvasSize: CGSize
  let settings: OverlayDisplaySettings

  @State private var popped = false
  @State private var burst = false
  @State private var image: NSImage?
  @State private var imageReady = false

  private var tier: CGFloat { CGFloat(min(item.comboCount, 20) / 5) }
  private var size: CGFloat { (220 + (tier - 1) * 70) * CGFloat(settings.sizeScale) }
  private var center: CGPoint {
    CGPoint(
      x: canvasSize.width * CGFloat(item.position.x),
      y: canvasSize.height * CGFloat(item.position.y)
    )
  }

  var body: some View {
    ZStack {
      StampFaceView(
        stamp: item.stamp,
        size: size,
        image: image,
        isReady: imageReady
      )
      .frame(width: size, height: size)
      .scaleEffect(burst ? 1.7 : (popped ? 1 : 0))
      .opacity(burst ? 0 : settings.stampOpacity)
      .shadow(color: .white.opacity(0.9), radius: 14)
      .animation(
        burst
          ? .easeIn(duration: 0.25)
          : .timingCurve(0.34, 1.56, 0.64, 1, duration: 0.2),
        value: burst ? 2 : (popped ? 1 : 0)
      )

      if burst {
        ForEach(0..<24, id: \.self) { index in
          StampBurstParticle(
            stamp: item.stamp,
            image: image,
            index: index,
            distanceScale: 1 + (tier - 1) * 0.2,
            sizeScale: CGFloat(settings.sizeScale),
            opacity: settings.stampOpacity
          )
        }
      }
    }
    .position(center)
    .task {
      image = await loadStampImage(for: item.stamp)
      imageReady = true
      await Task.yield()
      popped = true
      try? await Task.sleep(for: .milliseconds(550))
      guard !Task.isCancelled else { return }
      burst = true
    }
  }
}

private struct StampBurstParticle: View {
  let stamp: Stamp
  let image: NSImage?
  let index: Int
  let distanceScale: CGFloat
  let sizeScale: CGFloat
  let opacity: Double

  @State private var scattered = false
  @State private var fadedOut = false
  @State private var angle: CGFloat
  @State private var distance: CGFloat

  init(
    stamp: Stamp,
    image: NSImage?,
    index: Int,
    distanceScale: CGFloat,
    sizeScale: CGFloat,
    opacity: Double
  ) {
    self.stamp = stamp
    self.image = image
    self.index = index
    self.distanceScale = distanceScale
    self.sizeScale = sizeScale
    self.opacity = opacity
    _angle = State(
      initialValue: CGFloat(index) / 24 * .pi * 2
    )
    // Chrome拡張と同じ220〜520px。スタンプ自体のサイズだけmacOS向けに抑える。
    _distance = State(initialValue: CGFloat.random(in: 220...520) * distanceScale)
  }

  var body: some View {
    StampFaceView(
      stamp: stamp,
      size: 36 * sizeScale,
      image: image,
      isReady: true
    )
    .frame(width: 36 * sizeScale, height: 36 * sizeScale)
    .scaleEffect(scattered ? 0.4 : 1)
    .offset(
      x: scattered ? cos(angle) * distance : 0,
      y: scattered ? sin(angle) * distance : 0
    )
    .animation(.linear(duration: 0.9), value: scattered)
    .opacity(fadedOut ? 0 : opacity)
    .animation(.easeIn(duration: 0.9), value: fadedOut)
    .task {
      await Task.yield()
      scattered = true
      await Task.yield()
      fadedOut = true
    }
  }
}

private struct StampFaceView: View {
  let stamp: Stamp
  let size: CGFloat
  let image: NSImage?
  let isReady: Bool

  var body: some View {
    Group {
      if let image {
        AnimatedStampImage(image: image)
      } else if !isReady {
        Color.clear
      } else {
        Text(stamp.name.split(separator: " ").first.map(String.init) ?? stamp.name)
          .font(.system(size: size))
          .lineLimit(1)
      }
    }
  }
}

private struct AnimatedStampImage: NSViewRepresentable {
  let image: NSImage

  func makeNSView(context: Context) -> NSImageView {
    let imageView = NSImageView()
    imageView.imageAlignment = .alignCenter
    imageView.imageScaling = .scaleProportionallyUpOrDown
    imageView.animates = true
    return imageView
  }

  func updateNSView(_ imageView: NSImageView, context: Context) {
    // NSImageViewはGIFのフレームを再生できる。SwiftUIのImageは先頭フレームで静止する。
    if imageView.image !== image {
      imageView.image = image
    }
    imageView.animates = true
  }
}

private func loadStampImage(for stamp: Stamp) async -> NSImage? {
  guard
    stamp.category == .custom,
    !stamp.imageUrl.isEmpty,
    let url = URL(string: stamp.imageUrl),
    let data = try? await StampImageCache.shared.data(for: url)
  else { return nil }
  return NSImage(data: data)
}

extension Color {
  init(hex: String) {
    let value = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
    var parsed: UInt64 = 0
    guard value.count == 6, Scanner(string: value).scanHexInt64(&parsed) else {
      self = .white
      return
    }
    self.init(
      red: Double((parsed >> 16) & 0xff) / 255,
      green: Double((parsed >> 8) & 0xff) / 255,
      blue: Double(parsed & 0xff) / 255
    )
  }
}
