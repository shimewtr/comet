# macOSアプリ

macOSアプリはメニューバーに常駐し、Chrome拡張に限定せず画面全体へCometのコメントとスタンプを重ねて表示するクライアントです。

現在はSwiftPMベースのアプリ基盤と、認証なし環境へのWebSocket接続を実装しています。描画、表示設定、複数ディスプレイ、認証の進捗は[実装計画](plans/macos-overlay.md)を参照してください。

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

認証が有効な環境へのログインは未実装です。IdPのアクセストークンやclient secretをアプリへ保存せず、macOS用の短命チケットをKeychainで扱う方式を実装予定です。

## 表示設定とディスプレイ

Chrome拡張と同等の速度、文字・スタンプサイズ、コメントとスタンプそれぞれの不透明度、表示領域を設定できるようにする予定です。出力先は接続中の個別ディスプレイまたはすべてのディスプレイから選択できるようにし、構成変更にも追従させます。

## 権限

透明なウィンドウを画面上へ表示するだけなら、画面収録権限やアクセシビリティ権限は必要ありません。将来、画面画像を取得する機能を追加する場合は別途画面収録権限が必要です。
