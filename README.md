# Comet ☄️

リアルタイムコメント・スタンプシステム

Webアプリからコメント・スタンプを投稿すると、WebSocket経由で全接続端末にブロードキャストされ、Chrome拡張が投影中のページ（Googleスライドなど）にニコニコ動画風のオーバーレイとして描画します。

```mermaid
flowchart LR
    Web[Webアプリ<br>Amplify Hosting] -- 投稿 --> WS[WebSocket API<br>API Gateway + Lambda]
    WS -- 接続管理 --> DDB[(DynamoDB<br>connections)]
    WS -- ブロードキャスト --> Ext[Chrome拡張<br>docs.google.com]
    Web -- アップロード --> API[スタンプAPI<br>HTTP API + Lambda]
    API --> S3[(S3 stamps)]
    API --> DDB2[(DynamoDB stamps)]
    S3 --> CF[CloudFront CDN]
    CF -- スタンプ画像 --> Ext
```

## パッケージ構成

pnpm workspaceのmonorepoです。

| パッケージ | 内容 |
|---|---|
| `packages/shared` | 型定義・定数・バリデーション・`CometSocket`（共通WebSocketクライアント）・`generateId` |
| `packages/web` | 投稿用Webアプリ（React + Vite） |
| `packages/chrome-extension` | オーバーレイ描画用Chrome拡張（Manifest V3、docs.google.com上でのみ動作） |
| `packages/api/websocket-handler` | WebSocket用Lambda（connect / disconnect / message） |
| `packages/api/stamp-upload` | スタンプAPI用Lambda（一覧・アップロードURL発行・削除） |
| `packages/cdk` | インフラ定義（AWS CDK、4スタック構成） |

## 開発環境

- Node.js 22 / pnpm 10
- AWS CLI（デプロイ時。プロファイルは `shimewtr` を使用）

```bash
pnpm install

# 全パッケージのビルド（shared→依存パッケージの順で解決される）
pnpm -r build

# テスト（sharedのvitest）/ lint
pnpm -r test
pnpm -r lint
```

Webアプリをローカルで動かすには `packages/web/.env.local` が必要です：

```
VITE_WEBSOCKET_URL=wss://xxxx.execute-api.ap-northeast-1.amazonaws.com/prod
VITE_STAMP_API_URL=https://xxxx.execute-api.ap-northeast-1.amazonaws.com
```

実際のURLは `cdk deploy` のOutputs（`WebSocketURL` / `StampUploadApiUrl`）を参照してください。

## CI

GitHub Actions（`.github/workflows/ci.yml`）がPRとmainへのpushで「全パッケージビルド → lint → テスト → `cdk synth`」を実行します。デプロイは行いません。

## インフラ

CDKで以下の4スタックを管理しています（環境は `--context env=dev|prod` で切り替え）：

- **StorageStack**: WebSocket接続管理のDynamoDB（TTL付き、roomId GSI）
- **WebSocketStack**: API Gateway WebSocket API + Lambda 3本
- **StampStack**: スタンプ用S3 + CloudFront + DynamoDB（category GSI） + HTTP API + Lambda
- **WebStack**: WebアプリのCloudFront + S3ホスティング（webビルド成果物のアップロードと`comet-config.json`の生成までデプロイで行う）

ドメイン・認証などデプロイ先固有の設定は `packages/cdk/comet.config.json`（gitignore対象、`comet.config.example.json` 参照）に置きます。未設定なら「認証なし・CloudFront自動ドメイン」のデフォルト構成になります。

### リソース命名規則

CDK bootstrapに倣い、物理名は次の形式で統一しています（`lib/naming.ts` の `physicalName()`）：

```
comet-{env}-{リソースタイプ}-{accountId}-{region}
例: comet-dev-connections-123456789012-ap-northeast-1
```

## デプロイ

インフラ・Lambda・webの配信まで1コマンドに統合されています：

```bash
# 各パッケージのビルド成果物を最新化
pnpm --filter @comet/shared build
pnpm --filter @comet/websocket-handler build
pnpm --filter @comet/stamp-upload build
pnpm --filter @comet/web build   # .env.local の VITE_WEBSOCKET_URL を使用

cd packages/cdk
npx cdk diff --all --context env=dev --profile shimewtr    # 事前確認
npx cdk deploy --all --context env=dev --profile shimewtr
```

WebStackのデプロイでwebのビルド成果物がS3にアップロードされ、CloudFrontのキャッシュ無効化まで行われます。

注意点：

- ConnectionsTableの名前/ARNはクロススタック参照でexportされているため、テーブルの置換を伴う変更はStorageStack単独では更新できないことがあります（devなら該当スタックのdestroy→deployが早い）
- WebSocket APIを再作成するとURLが変わります。その場合は `packages/web/.env.local` を更新してwebを再ビルド・再デプロイしてください（拡張は「自動取得」で追従できます）

### Chrome拡張

```bash
pnpm --filter @comet/chrome-extension build
```

`chrome://extensions` で `packages/chrome-extension/dist` を読み込んでください。動作対象は `https://docs.google.com/*` のみです（`manifest.json` の `matches` で制限）。

接続設定はポップアップから行います。**WebアプリURLを入力して「自動取得」を押すと、Webアプリが配信する `/comet-config.json` からWebSocket URLを取得**して設定できます（`comet-config.json` はCDKデプロイ時にインフラ側の値から生成され、CloudFrontでこのファイルのみCORSが許可されています）。WebSocket URLを手入力することも可能です。

## セキュリティ上のポイント

- WebSocketで受信したペイロードはサーバ側で検証し、検証済みフィールドのみブロードキャストします（コメント文字数・スタイルの許可リスト・スタンプ画像URLのCloudFront限定など。`shared/src/utils/validation.ts`）
- 拡張側でもスタンプ画像URLを許可リスト検証してから `img.src` に設定します
