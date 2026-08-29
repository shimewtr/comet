# macOSアプリ

macOSアプリはメニューバーに常駐し、Chrome拡張に限定せず画面全体へCometのコメントとスタンプを重ねて表示するクライアントです。

現在はSwiftPMベースのアプリ基盤を実装しています。接続、描画、認証の進捗は[実装計画](plans/macos-overlay.md)を参照してください。

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

起動するとメニューバーにCometアイコンが表示されます。現段階では設定の保存と基本状態表示だけを提供します。

## 権限

透明なウィンドウを画面上へ表示するだけなら、画面収録権限やアクセシビリティ権限は必要ありません。将来、画面画像を取得する機能を追加する場合は別途画面収録権限が必要です。
