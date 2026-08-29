# macOSアプリ

macOSアプリはメニューバーに常駐し、Chrome拡張に限定せず画面全体へCometのコメントとスタンプを重ねて表示するクライアントです。

現在はSwiftPMベースのアプリ基盤、認証なし環境へのWebSocket接続、透明オーバーレイへのコメントとスタンプの描画を実装しています。表示設定、出力先ディスプレイ選択、認証の進捗は[実装計画](plans/macos-overlay.md)を参照してください。

## 必要な環境

- macOS 14以降
- Apple Swift 6以降
- ローカル実行と配布用.appの作成にはXcodeを推奨

Command Line Toolsだけでもbuildとunit testを実行できます。

## buildとtest

```bash
swift build --package-path packages/macos-app
swift test --package-path packages/macos-app
xcrun swift-format lint --strict --recursive packages/macos-app
```

警告も失敗として検証する場合は次を実行します。

```bash
swift build --package-path packages/macos-app -Xswiftc -warnings-as-errors
swift test --package-path packages/macos-app -Xswiftc -warnings-as-errors
```

## 開発起動

```bash
swift run --package-path packages/macos-app CometOverlay
```

起動するとメニューバーにCometアイコンが表示されます。設定画面へWebアプリURLを入力して接続すると、`comet-config.json`からWebSocket URLを取得し、Room一覧を選択できます。切断時は指数バックオフで自動再接続します。

受信したコメントとスタンプは、接続中の各ディスプレイに作成した透明ウィンドウへ表示されます。ウィンドウはクリックを透過するため、背後のスライドやアプリをそのまま操作できます。コメントとスタンプは件数上限付きのキューで管理し、スタンプ画像はHTTPSのCloudFront URLだけを読み込みます。

認証が有効な環境へのログインは未実装です。IdPのアクセストークンやclient secretをアプリへ保存せず、macOS用の短命チケットをKeychainで扱う方式を実装予定です。

## 表示設定とディスプレイ

設定画面ではChrome拡張と同等の項目を調整でき、変更は表示中のオーバーレイへ即時反映されます。

- コメント速度: 0.5〜2.0倍
- 文字・スタンプサイズ: 0.5〜2.0倍
- コメントの不透明度: 20〜100%
- スタンプの不透明度: 20〜100%
- 表示領域: 画面全体、上半分、上1/3

出力先は接続中の個別ディスプレイまたはすべてのディスプレイから選択できます。選択したディスプレイが外れている間はメインディスプレイへフォールバックし、保存した選択自体は維持します。「テスト表示」で接続前にも見え方を確認でき、「表示を緊急停止」ですべてのオーバーレイを即座に閉じられます。

ディスプレイはCoreGraphicsの永続UUIDで識別します。解像度変更や再接続時は画面に合わせて透明ウィンドウを再配置します。フルスクリーン・Spaces・Stage Manager・画面抜き差しの実機確認は[受け入れテスト](macos-app-acceptance.md)を参照してください。

## 権限

透明なウィンドウを画面上へ表示するだけなら、画面収録権限やアクセシビリティ権限は必要ありません。将来、画面画像を取得する機能を追加する場合は別途画面収録権限が必要です。
