# アーキテクチャ

## 全体像

Cometは、投稿用Webアプリ、WebSocket API、永続化・履歴API、Chrome拡張、macOSオーバーレイアプリから構成されます。すべての投稿と投票はRoom単位で分離され、同じRoomへ参加している接続だけに配信されます。

```mermaid
flowchart TB
    Web[React Web App] -->|投稿・Room操作| WSA[API Gateway WebSocket]
    WSA --> WSL[WebSocket Lambda]
    WSL --> Tables[(Connections / Comments / Rooms / Events / Polls)]
    WSL -->|broadcast| Extension[Chrome Extension]
    WSL -->|broadcast| Mac[macOS overlay app]
    Web -->|upload / list / delete| StampAPI[HTTP API + Stamp Lambda]
    StampAPI --> StampTable[(Stamps Table)]
    StampAPI --> StampBucket[(Stamp Bucket)]
    Web -->|履歴取得| HistoryAPI[HTTP API + History Lambda]
    HistoryAPI --> Tables
    Web -. runtime config .-> Config[/comet-config.json]
    Extension -. runtime config .-> Config
```

## AWSスタック

CDKは環境ごとに次のスタックを管理します。

- `StorageStack`: 接続、コメント、Room、イベント、投票、投票最終票用DynamoDBと認証署名鍵
- `WebSocketStack`: API Gateway WebSocket APIと接続・切断・メッセージ処理Lambda
- `StampStack`: スタンプ用S3、CloudFront、DynamoDB、HTTP API、Lambda
- `HistoryStack`: 履歴・集計用HTTP APIとLambda
- `WebStack`: Web用S3、CloudFront、ランタイム設定、任意の独自ドメインと認証

OIDC認証を有効にすると、Lambda@Edge用スタックがus-east-1にも作成されます。

## Room

- `global` は常に利用できる期限なしのRoomです。
- 作成したRoomは最終利用から3時間で期限切れになります。
- `?room=<roomId>` を含むWeb URLを共有すると同じRoomへ直接参加できます。
- Chrome拡張では表示対象Roomをポップアップから選択します。
- カスタムスタンプはRoom間で共通です。
- 投票はmacOSアプリが開始・終了・中止・結果を閉じる操作を管理し、Roomごとに表示中の投票を1件保持します。
- Web参加者は既存の絵文字スタンプを送るだけで投票します。同じブラウザからの最後の対象スタンプだけが1票として集計されます。

## ランタイム設定

CDKはWebデプロイ時に `/comet-config.json` を生成します。WebアプリとChrome拡張は同じファイルから次の値を取得します。

- WebSocket URL
- 履歴API URL
- 認証の有効・無効

これにより、環境ごとにWebアプリを手作業で書き換える必要はありません。ローカル開発ではViteの環境変数をフォールバックとして使用します。

## リソース命名

物理名は原則として次の形式です。

```text
comet-{env}-{resourceType}-{accountId}-{region}
```

AWSアカウントとリージョンを含めることで、異なるアカウントへ同じ`dev`環境を安全に作成できます。
