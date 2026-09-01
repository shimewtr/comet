import CometOverlayCore
import SwiftUI

struct PollSetupMenu: View {
  @ObservedObject var model: AppModel
  var body: some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        Text("投票を作成").font(.headline)
        Spacer()
        Button("戻る") { model.cancelPollSetup() }.buttonStyle(.borderless)
      }
      TextField("投票タイトル（任意）", text: $model.pollDraft.title).textFieldStyle(.roundedBorder)
      Picker("時間", selection: $model.pollDraft.durationSeconds) {
        Text("10秒").tag(10)
        Text("30秒").tag(30)
        Text("1分").tag(60)
        Text("2分").tag(120)
        Text("5分").tag(300)
      }
      ForEach($model.pollDraft.options) { $option in
        HStack(spacing: 6) {
          Text(option.emoji).font(.title3).frame(width: 32, height: 30).background(
            .quaternary, in: RoundedRectangle(cornerRadius: 6))
          TextField("ラベル", text: $option.label).textFieldStyle(.roundedBorder)
          Button {
            model.removePollOption(id: option.id)
          } label: {
            Image(systemName: "minus.circle")
          }
          .buttonStyle(.borderless).disabled(model.pollDraft.options.count <= 2)
        }
      }
      Button {
        model.addPollOption()
      } label: {
        Label("選択肢を追加", systemImage: "plus")
      }
      .buttonStyle(.borderless).disabled(model.pollDraft.options.count >= 8)
      Button("投票を開始") { model.startPoll() }
        .buttonStyle(.borderedProminent).frame(maxWidth: .infinity).disabled(!model.canStartPoll)
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}

struct PollStatusMenu: View {
  @ObservedObject var model: AppModel
  let poll: PresentationPoll
  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack {
        Label(
          poll.status == .active ? "投票中" : "投票結果",
          systemImage: poll.status == .active ? "chart.bar.xaxis" : "chart.bar.fill"
        ).font(.headline)
        Spacer()
        if poll.status == .active { Text("\(poll.totalVotes)票").font(.caption).monospacedDigit() }
      }
      if !poll.title.isEmpty { Text(poll.title).font(.caption).lineLimit(1) }
      if model.canManagePoll {
        if poll.status == .active {
          HStack {
            Button("今すぐ終了") { model.endPoll() }
            Button("中止", role: .destructive) { model.cancelActivePoll() }
          }
        } else {
          Button("投票結果を閉じる") { model.closePollResults() }
        }
      } else {
        Text("この投票は別のMacで管理されています").font(.caption2).foregroundStyle(.secondary)
      }
    }.frame(maxWidth: .infinity, alignment: .leading)
  }
}
