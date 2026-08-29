# macOSオーバーレイアプリ実装計画

## ゴール

Cometのコメントとスタンプを、ChromeやGoogleスライドに限定せずmacOSの画面全体へ表示するネイティブアプリを提供する。

完了条件は次のとおり。

- Keynote、Googleスライド、PowerPointの通常表示とフルスクリーン表示より前面に表示できる
- オーバーレイがクリックやキーボード操作を背後のアプリから奪わない
- 複数ディスプレイ、Spaces、Stage Manager、ディスプレイ構成変更に対応する
- 既存のWebアプリURLからランタイム設定を取得し、Roomへ接続できる
- コメントとスタンプを既存クライアントと互換性のある見た目・タイミングで表示する
- 認証なし構成とOIDC認証付き構成の両方へ接続できる
- build、unit test、lint相当の静的検査をGitHub Actionsで実行できる
- 署名していない開発用アプリをローカルで起動し、手動受け入れテストを実施できる

## スコープ外

初期リリースでは次を必須にしない。

- Mac App Storeでの配布
- Windows版
- 画面録画、スクリーンショット、配信映像の合成
- Chrome拡張の廃止
- システムのロック画面や保護されたコンテンツへの表示

単に透明ウィンドウを表示するMVPでは画面収録権限を要求しない。将来、画面取得機能を追加する場合だけScreenCaptureKitと画面収録権限を導入する。

## 技術方針

- SwiftUIをメニューバー、設定、状態表示に使用する
- AppKitの`NSPanel`または`NSWindow`を透明オーバーレイに使用する
- ディスプレイごとに独立した透明ウィンドウを管理する
- `ignoresMouseEvents`でクリックを透過する
- `canJoinAllSpaces`、`fullScreenAuxiliary`、適切なwindow levelを組み合わせる
- 最初は`.floating`相当から始め、プレゼンアプリごとの実機結果に基づいて必要最小限のlevelへ調整する
- 通信は`URLSessionWebSocketTask`を使用し、不要な外部依存を追加しない
- macOS側のプロトコルモデルと共有JSON fixtureを用意し、TypeScript実装との互換性をテストする
- 認証チケットはKeychainへ保存し、IdPアクセストークンは保存しない
- Chrome専用の`/auth/extension`とは別に、固定callbackを持つdesktop認証フローを設計する

## 開発環境の確認結果

計画作成時点のローカル環境にはApple Swift 6.3.3とmacOS SDK 26.5があるが、SDKはSwift 6.3.2で生成されておりtoolchainが一致していない。また、active developer directoryはCommand Line Toolsで、完全版Xcodeの`xcodebuild`は利用できない。

このため、基盤はSwift Packageとして通常の環境で`swift build`と`swift test`を実行できるようにする。このMacでの自動検証はCommand Line Tools更新後に再実行し、当面はGitHub ActionsのmacOS runnerを正とする。完全版Xcodeが必要な.app bundle、コード署名、Notarization、GUIの手動操作は後段のリリース工程で扱う。

## ブランチ運用

統合先は`feature/macos-overlay`とする。各ステップは統合ブランチの最新状態から`step/macos-overlay-XX-*`を作り、完了条件を満たした後に`--no-ff`で統合ブランチへマージする。

各ステップで次を守る。

1. ステップ専用ブランチを作る
2. 実装とそのステップに必要なテストを同じブランチへ入れる
3. build、test、差分レビューを実行する
4. ステップの完了条件を計画書へ記録する
5. `feature/macos-overlay`へ`--no-ff`でマージする
6. 次のステップは更新後の統合ブランチから開始する

`feature/macos-overlay`から`main`へのPRは、MVPの受け入れテスト完了後に作る。AWSへのdeploy、署名済み成果物の公開、mainへのマージはユーザーの明示確認なしに実行しない。

## 実装ステップ

### 00. 計画と作業環境

ブランチ: `step/macos-overlay-00-plan`

- 専用worktreeを作る
- 技術方針、完了条件、ブランチ運用を記録する
- XcodeとSwiftの利用可能バージョンを確認する
- 既存WebSocketプロトコルと認証フローの境界を整理する

完了条件:

- 本計画が`feature/macos-overlay`へマージされている
- 後続ステップのブランチ名と検証基準が確定している

### 01. macOSアプリの基盤

ブランチ: `step/macos-overlay-01-foundation`

- `packages/macos-app`へSwift PackageベースのmacOSアプリを追加する
- SwiftUIのメニューバーアプリを起動できるようにする
- アプリ状態、設定、通信、描画を分離した最小構成を作る
- unit test targetとmacOS用CI buildを追加する
- READMEとローカル開発手順を追加する

完了条件:

- `swift build`と`swift test`が成功する
- メニューバーからアプリを終了できる
- CIが既存パッケージとmacOSアプリの両方を検証する

### 02. 設定取得とWebSocket接続

ブランチ: `step/macos-overlay-02-connection`

- WebアプリURLを保存する
- `/comet-config.json`を取得・検証する
- `URLSessionWebSocketTask`で接続、切断、keepalive、再接続を実装する
- Room一覧取得とRoom選択を実装する
- 既存のコメント・スタンプmessageをSwiftモデルへ変換する
- TypeScript側と共有するJSON fixtureで互換性をテストする

完了条件:

- 認証なしdev環境へ接続できる
- Roomを選択してコメントとスタンプイベントを受信できる
- 不正設定、切断、再接続がunit testで確認できる

### 03. 透明オーバーレイと描画

ブランチ: `step/macos-overlay-03-rendering`

- `NSScreen`ごとの透明・枠なし・クリック透過ウィンドウを実装する
- コメントの横スクロール、上・下固定表示を実装する
- スタンプ画像の取得、キャッシュ、アニメーションを実装する
- 表示レーン、衝突回避、同時表示上限を実装する
- Retina scaleと異なる解像度へ対応する

完了条件:

- 通常のデスクトップ上でコメントとスタンプを滑らかに表示できる
- 背後のアプリをクリック、ドラッグ、キー操作できる
- 大量イベントでも表示キューが制御され、メモリが増え続けない

### 04. メニューバーUIと操作

ブランチ: `step/macos-overlay-04-controls`

- 接続状態、WebアプリURL、Room、対象ディスプレイを操作できるようにする
- 対象ディスプレイは「すべて」または接続中の個別ディスプレイから選択できるようにする
- 表示ON/OFFに加え、Chrome拡張と同等の速度倍率（0.5〜2.0）、文字・スタンプのサイズ倍率（0.5〜2.0）、コメントとスタンプそれぞれの不透明度（0.2〜1.0）、表示領域（全体・上半分・上1/3）を設定できるようにする
- 設定を安全に永続化する
- オーバーレイの緊急停止操作を用意する
- エラーと再接続状態をユーザーへ表示する

完了条件:

- アプリ再起動後に設定が復元される
- ネットワーク障害からUI操作なしで復帰できる
- 表示を即座に停止できる

### 05. フルスクリーンと複数ディスプレイの実機対応

ブランチ: `step/macos-overlay-05-fullscreen`

- `canJoinAllSpaces`と`fullScreenAuxiliary`を検証する
- Keynote、ChromeのGoogleスライド、PowerPoint用の受け入れテスト手順を用意する
- macOSフルスクリーン、Spaces切り替え、Stage Managerを検証する
- ディスプレイ接続・切断、ミラーリング、解像度変更へ追従する
- ディスプレイ名と安定した識別子を設定UIへ提示し、選択したディスプレイが外れた場合のフォールバックを定義する
- システムUIを不必要に覆わないwindow levelを確定する

完了条件:

- window levelとcollection behaviorを自動テストで確認できる
- 発表操作を妨げない
- 複数ディスプレイで指定画面だけ、または全画面へ表示できる
- ディスプレイ構成の変更後も保存済みの選択が可能な限り維持される
- 対象3アプリの手動受け入れテスト手順と結果記録欄が用意されている
- 対応不能なOS・アプリ固有制約をドキュメント化する

対象3アプリでの実機確認は最終PR前の手動ゲートとする。完全版Xcodeやプレゼンアプリが不足していても、後続の認証・リリース準備は停止せず進める。

### 06. macOS認証フロー

ブランチ: `step/macos-overlay-06-auth`

- desktop用ログイン開始・callback方式を脅威モデルとともに設計する
- `ASWebAuthenticationSession`から固定URL Schemeまたはloopback callbackへ戻す
- 短命Cometチケットを受け取りKeychainへ保存する
- 期限前更新、ログアウト、失効時の再ログインを実装する
- callbackの改ざん、任意URLへの転送、チケット漏えいをテストする

完了条件:

- 認証付きdev環境でログイン、Room接続、更新、ログアウトが動作する
- IdPアクセストークンやclient secretをアプリへ保存しない
- 認証変更についてセキュリティレビューを実施する

### 07. リリース品質と配布準備

ブランチ: `step/macos-overlay-07-release`

- アプリアイコン、バージョン、ログ、クラッシュ時情報を整備する
- Release build、コード署名、Notarizationの手順を用意する
- GitHub ActionsへmacOS test/buildを統合する
- インストール、アップデート、アンインストール手順を文書化する
- OSSへ含めない証明書・プロファイル・認証情報を除外する

完了条件:

- クリーン環境から再現可能なRelease buildを作成できる
- 署名情報をリポジトリへ保存せず署名・Notarizationできる
- MVPの全受け入れ項目と既存CIが成功する

## 受け入れテスト一覧

- Keynoteのフルスクリーンスライドショー
- ChromeのGoogleスライド全画面表示
- PowerPointのスライドショー
- 通常ウィンドウ、macOSフルスクリーン、Spaces、Stage Manager
- 内蔵画面のみ、外部画面のみ、拡張、ミラーリング
- ディスプレイの接続・切断と解像度変更
- コメント連投、スタンプ連投、長時間接続、ネットワーク切断・復帰
- オーバーレイ表示中のクリック、ドラッグ、キーボード、発表者操作
- 認証あり・なし、チケット更新、ログアウト、期限切れ

## 自律実行時の停止条件

Codexは各ステップを独立して実装・検証し、成功したステップだけを`feature/macos-overlay`へマージする。次の場合は自律実行を停止してユーザーへ確認する。

- AWSまたは別環境へのdeploy
- mainへのマージ、Release公開、署名・Notarizationの実行
- 有料サービスの利用や新しい秘密情報が必要
- 要件を大きく変える判断が必要
- 既存データを失う可能性のある操作が必要

テスト失敗、lint、ビルドエラー、通常の依存導入、ローカルファイル変更、stepブランチの作成・コミット・統合ブランチへのマージは、停止せず原因調査と修正を続ける。
