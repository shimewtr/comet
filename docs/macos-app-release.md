# macOSアプリの配布

この文書はComet Overlayの未署名.app作成、Developer ID署名、Notarization、インストールと診断の手順です。証明書、秘密鍵、Notarization資格情報はリポジトリへ保存しません。

## 未署名.appの作成

macOS 14以降とApple Swift 6以降を用意し、リポジトリのルートで実行します。

```bash
scripts/build-macos-app.sh
```

SwiftPMでarm64とx86_64のrelease buildを作ってUniversal Binaryへまとめ、Info.plistと既存のCometアイコンを含む`build/macos/CometOverlay.app`を再生成します。Info.plistのバージョン、build番号、Bundle ID、`comet-overlay` URL Schemeは[配布用Info.plist](../packages/macos-app/Resources/Info.plist)を単一の情報源とします。

ローカル開発では未署名のまま次のコマンドで起動できます。

```bash
open build/macos/CometOverlay.app
```

初回起動をGatekeeperが止める場合は、FinderでアプリをControl+クリックして「開く」を選びます。配布先で警告なしに起動するにはDeveloper ID署名とNotarizationが必要です。

## バージョン更新

リリースごとにInfo.plistの次の2項目を更新し、CIでbundle生成が成功することを確認します。

- `CFBundleShortVersionString`: ユーザー向けSemVer（例: `0.2.0`）
- `CFBundleVersion`: 単調増加する整数build番号

アプリの設定画面はこの値を表示します。

## Developer ID署名

Developer ID Application証明書と秘密鍵をログインKeychainへ読み込み、証明書の表示名を環境変数へ設定します。値や`.p12`をリポジトリへ書かないでください。

```bash
export COMET_CODESIGN_IDENTITY='Developer ID Application: Example, Inc. (TEAMID)'
codesign --force --options runtime --timestamp \
  --sign "$COMET_CODESIGN_IDENTITY" build/macos/CometOverlay.app
codesign --verify --deep --strict --verbose=2 build/macos/CometOverlay.app
```

現在のMVPは画面収録、アクセシビリティ、App Sandbox entitlementを要求しません。機能追加でentitlementが必要になった場合は、署名前にレビュー済みのentitlementsファイルを追加します。

## Notarization

Appleの資格情報は`notarytool store-credentials`でローカルKeychainへ保存するか、CIのsecret storeから一時的に注入します。App Store Connect API keyを使う場合も`AuthKey_*.p8`はリポジトリ外へ置きます。

```bash
xcrun notarytool store-credentials comet-notary
ditto -c -k --keepParent build/macos/CometOverlay.app build/macos/CometOverlay.zip
xcrun notarytool submit build/macos/CometOverlay.zip \
  --keychain-profile comet-notary --wait
xcrun stapler staple build/macos/CometOverlay.app
xcrun stapler validate build/macos/CometOverlay.app
spctl --assess --type execute --verbose=2 build/macos/CometOverlay.app
```

署名とNotarizationの実行、署名済み成果物の公開はリリース管理者が明示的に承認してから行います。GitHub Actionsの通常CIは未署名bundleだけを作り、Apple資格情報にはアクセスしません。

## インストールとアップデート

署名・Notarization済みの`CometOverlay.app`を`/Applications`へコピーし、ApplicationsまたはSpotlightから起動します。メニューバーのCometアイコンから接続と表示を操作できます。

アップデート時はメニューバーからアプリを終了し、新しい`.app`で置き換えます。WebアプリURL、表示設定、対象ディスプレイ、Keychain内の有効な短命チケットは同じBundle IDなら維持されます。初期版には自動アップデーターを含めません。

## アンインストール

1. メニューバーからComet Overlayを終了する
2. `/Applications/CometOverlay.app`をFinderのゴミ箱へ移動する
3. 設定も消す場合は`defaults delete com.shimewtr.comet.overlay`を実行する
4. 認証チケットも消す場合は`security delete-generic-password -s com.shimewtr.comet.macos.auth-ticket`を実行する

Web側のCometセッションも消す場合は、アンインストール前にアプリの「ログアウト」を実行します。

## ログとクラッシュ情報

アプリはApple Unified Loggingへ起動・終了、接続要求、失敗した処理のエラー型を記録します。WebアプリURL、Roomの投稿内容、認証コード、チケットは記録しません。

直近1時間のログは次のように確認できます。

```bash
log show --last 1h --style compact \
  --predicate 'subsystem == "com.shimewtr.comet.overlay"'
```

クラッシュレポートは通常`~/Library/Logs/DiagnosticReports/CometOverlay-*.ips`に保存されます。Issueへ添付する前に、ユーザー名、ファイルパス、接続先などの端末固有情報がないか確認してください。

## リリース前チェック

- `swift build`、`swift test`、`swift-format`、未署名bundle生成がCIで成功している
- Info.plistのversion、build番号、Bundle ID、URL Schemeが意図どおりである
- `codesign`、`stapler`、`spctl`の検証が成功している
- [macOS受け入れテスト](macos-app-acceptance.md)を対象OSと3つのプレゼンアプリで実施している
- `git status`と秘密情報スキャンで証明書、秘密鍵、profile、tokenが含まれていない
