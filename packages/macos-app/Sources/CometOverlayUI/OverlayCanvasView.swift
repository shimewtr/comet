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
        text
          .position(x: canvasSize.width / 2, y: max(fontSize, canvasSize.height * 0.08))
      case .fixedBottom:
        text
          .position(x: canvasSize.width / 2, y: canvasSize.height - max(fontSize, 80))
      }
    }
    .modifier(CommentEffect(animation: item.comment.style.animation))
    .task {
      guard item.placement == .scrolling else { return }
      try? await Task.sleep(for: .seconds(item.delay))
      guard !Task.isCancelled else { return }
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
    let visibleHeight = canvasSize.height * CGFloat(settings.displayArea.heightFraction)
    let laneHeight = max(48, fontSize * 1.35)
    let laneCount = max(1, Int(visibleHeight / laneHeight))
    return (CGFloat(item.lane % laneCount) + 0.5) * laneHeight
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

  @State private var image: NSImage?
  @State private var appeared = false

  var body: some View {
    Group {
      if let image {
        Image(nsImage: image)
          .resizable()
          .scaledToFit()
      } else {
        Text("✨")
          .font(.system(size: size * 0.65))
      }
    }
    .frame(width: size, height: size)
    .position(x: position.x, y: position.y)
    .opacity(appeared ? settings.stampOpacity : 0)
    .scaleEffect(appeared ? 1 : 0.25)
    .animation(.spring(response: 0.35, dampingFraction: 0.55), value: appeared)
    .task {
      appeared = true
      guard let url = URL(string: item.message.stamp.imageUrl), !item.message.stamp.imageUrl.isEmpty
      else { return }
      if let data = try? await StampImageCache.shared.data(for: url) {
        image = NSImage(data: data)
      }
    }
  }

  private var size: CGFloat { 120 * CGFloat(settings.sizeScale) }

  private var position: CGPoint {
    let normalized = item.message.position ?? StampPosition(x: 0.5, y: 0.5)
    return CGPoint(
      x: CGFloat(min(max(normalized.x, 0.05), 0.95)) * canvasSize.width,
      y: CGFloat(min(max(normalized.y, 0.05), 0.95)) * canvasSize.height
    )
  }
}

extension Color {
  fileprivate init(hex: String) {
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
