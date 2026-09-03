# ローカル開発

## 必要な環境

- Node.js 24 LTS（正確なバージョンは`.node-version`を参照）
- pnpm 10
- AWS CLI v2（AWSへ接続・デプロイする場合のみ）
- Google Chrome（Chrome拡張を確認する場合）

## セットアップ

```bash
pnpm install
pnpm build
```

このリポジトリはpnpm workspaceのmonorepoです。`packages/shared` の生成物をWeb・API・Chrome拡張が参照するため、初回は全体をbuildしてください。

## Webアプリ

UIだけを確認する場合は、そのままViteを起動できます。

```bash
pnpm --filter @comet/web dev
```

通常は http://localhost:5173 で起動します。バックエンド未設定時はWebSocket未設定のメッセージが表示されますが、画面の確認は可能です。

AWS上のバックエンドへ接続する場合は、Git管理対象外の `packages/web/.env.local` を作成します。

```dotenv
VITE_WEBSOCKET_URL=wss://example.execute-api.ap-northeast-1.amazonaws.com/prod
VITE_STAMP_API_URL=https://example.execute-api.ap-northeast-1.amazonaws.com
VITE_HISTORY_API_URL=https://example.execute-api.ap-northeast-1.amazonaws.com/history
```

デプロイ済みWebでは、CDKが生成する `/comet-config.json` がWebSocket URLと履歴API URLの正となります。

## Chrome拡張

```bash
pnpm --filter @comet/chrome-extension dev
```

webpackが変更を監視して `packages/chrome-extension/dist` を更新します。Chrome側では変更のたびに拡張機能を再読み込みしてください。詳しい設定は[Chrome拡張ガイド](chrome-extension.md)を参照してください。

## macOSアプリ

macOS 14以降とSwift 6以降では、ネイティブの全画面オーバーレイを開発できます。

```bash
swift run --package-path packages/macos-app CometOverlay
swift test --package-path packages/macos-app
xcrun swift-format lint --strict --recursive packages/macos-app
```

ApplicationsやSpotlightから確認するための未署名アプリは、次のコマンドで作成します。

```bash
scripts/build-macos-app.sh
open build/macos/Comet.app
```

接続、認証、タイマー、投票、複数ディスプレイの確認項目は[macOSアプリガイド](macos-app.md)と[受け入れテスト](macos-app-acceptance.md)を参照してください。

## build・test・lint

```bash
pnpm build
pnpm test
pnpm lint
```

個別パッケージだけを実行する場合はfilterを使います。

```bash
pnpm --filter @comet/web build
pnpm --filter @comet/shared test
pnpm --filter @comet/web lint
```

Webの画面テストは、WebSocket接続状態・Room参加中の投稿ガードを含めて確認します。

## ローカル設定と秘密情報

次のファイルはGitへコミットしないでください。`.gitignore`で除外されています。

- `.env`、`.env.local`、`.env.*.local`
- `packages/cdk/comet.config.json`
- `packages/cdk/comet.config.<name>.json`
- `packages/cdk/cdk.context.json`

OIDC client secret自体は設定ファイルへ書かず、AWS Secrets Managerへ保存します。
