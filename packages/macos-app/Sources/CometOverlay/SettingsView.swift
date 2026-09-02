import CometOverlayCore
import SwiftUI

struct SettingsView: View {
  @ObservedObject var model: AppModel
  @State private var showsResetConfirmation = false
  var body: some View {
    Form {
      Section("接続") {
        LabeledContent("状態", value: model.connectionDescription)
        Text("WebアプリURL、接続、Room、出力先の操作はメニューバーから行います。").font(.caption).foregroundStyle(.secondary)
      }
      Section("認証") {
        LabeledContent("状態", value: model.authenticationDescription)
        Button("ログアウト") { model.logout() }.disabled(!model.canLogout)
        Text("ログアウトすると、KeychainのComet認証チケットとブラウザのCometセッションを削除します。").font(.caption).foregroundStyle(
          .secondary)
      }
      Section("表示") {
        Toggle("参加用QRコードを表示", isOn: $model.settings.participationQREnabled)
        Text("WebアプリURLのQRコードを、選択した出力先の右下へ最前面表示します。").font(.caption).foregroundStyle(.secondary)
        Toggle("コメント一覧を表示", isOn: $model.settings.commentListEnabled)
        Text("受信したコメントを一覧で表示します。流れるコメント表示とは別に使えます。").font(.caption).foregroundStyle(.secondary)
        SettingsSlider(
          title: "コメント速度", value: $model.settings.displaySettings.speedScale, range: 0.5...2,
          step: 0.1
        ) { String(format: "%.1fx", $0) }
        SettingsSlider(
          title: "文字・スタンプサイズ", value: $model.settings.displaySettings.sizeScale, range: 0.5...2,
          step: 0.1
        ) { String(format: "%.1fx", $0) }
        SettingsSlider(
          title: "コメントの濃さ", value: $model.settings.displaySettings.commentOpacity, range: 0.2...1,
          step: 0.05
        ) { "\(Int($0 * 100))%" }
        SettingsSlider(
          title: "スタンプの濃さ", value: $model.settings.displaySettings.stampOpacity, range: 0.2...1,
          step: 0.05
        ) { "\(Int($0 * 100))%" }
        Picker("表示領域", selection: $model.settings.displaySettings.displayArea) {
          Text("画面全体").tag(OverlayDisplayArea.full)
          Text("上半分").tag(OverlayDisplayArea.topHalf)
          Text("上1/3").tag(OverlayDisplayArea.topThird)
        }
        Button("コメントとスタンプをテスト表示") {
          if !model.settings.overlaysEnabled { model.settings.overlaysEnabled = true }
          model.previewOverlay()
        }
      }
      Section("タイマー") {
        Toggle("タイマーを表示", isOn: $model.settings.presentationTimerEnabled)
        Text("選択した出力先の上部へ最前面表示します。タイマーへポインタを重ねると操作ボタンが表示されます。").font(.caption).foregroundStyle(
          .secondary)
      }
      Section("詳細") {
        LabeledContent("Comet", value: AppMetadata.versionDescription)
        Text("診断ログにURL、投稿内容、認証チケットは記録しません。").font(.caption).foregroundStyle(.secondary)
        Button("設定を初期値に戻す", role: .destructive) { showsResetConfirmation = true }
      }
    }.formStyle(.grouped).padding().frame(width: 560, height: 720)
      .confirmationDialog(
        "すべての設定を初期値に戻しますか？", isPresented: $showsResetConfirmation, titleVisibility: .visible
      ) {
        Button("初期値に戻す", role: .destructive) { model.resetSettings() }
        Button("キャンセル", role: .cancel) {}
      } message: {
        Text("WebアプリURL、表示調整、Room、出力先がリセットされ、接続が切れます。")
      }
  }
}

struct SettingsSlider: View {
  let title: String
  @Binding var value: Double
  let range: ClosedRange<Double>
  let step: Double
  let valueText: (Double) -> String
  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      HStack {
        Text(title)
        Spacer()
        Text(valueText(value)).monospacedDigit().foregroundStyle(.secondary)
      }
      Slider(value: $value, in: range, step: step)
    }
  }
}
