# OIDC認証

Cometはデフォルトでは認証なしの公開構成です。必要な環境だけ、Okta・Auth0・CognitoなどのOIDCプロバイダによる認証を有効化できます。

設計上の背景とチケット方式の詳細は[ホスティング・認証の設計背景](design/hosting-and-auth.md)を参照してください。

## 認証の流れ

1. CloudFrontのLambda@EdgeがOIDCログインを要求する
2. 認証後、WebセッションをHttpOnly Cookieへ保存する
3. WebまたはChrome拡張が短命なCometチケットを取得する
4. WebSocketとスタンプAPIがチケットを検証する

IdPのアクセストークンをWebSocketメッセージやChrome storageへ直接保存しません。

## IdP側の設定

- public client: Authorization Code + PKCE。client secretは不要
- confidential client: Authorization Code + PKCE。client secretをSecrets Managerへ保存
- リダイレクトURI: `https://<web-domain>/auth/callback`

独自ドメインを使う場合は、IdPへ登録する前にドメインを決めてください。CloudFront自動ドメインを使う場合は、最初に認証なしでデプロイしてWeb URLを取得します。

## Comet設定

Git管理対象外の `packages/cdk/comet.config.json` または名前付き設定へ `auth` を追加します。

```json
{
  "envs": {
    "prod": {
      "profile": "your-production-profile",
      "auth": {
        "issuer": "https://idp.example.com/oauth2/default",
        "clientId": "your-client-id",
        "clientSecretId": "optional/oidc/client-secret",
        "clientSecretMethod": "client_secret_post"
      }
    }
  }
}
```

`clientSecretMethod` は `client_secret_basic`（デフォルト）または `client_secret_post` です。

Secrets Managerの値には、生のclient secretまたは次のキーを持つJSONを利用できます。

- `secret`
- `client_secret`
- `clientSecret`

issuer URLとclient IDはOIDC上の公開識別子ですが、組織固有情報をOSSへ含めないためローカル設定に置くことを推奨します。client secret自体は必ずSecrets Managerへ保存してください。

## デプロイ

認証ではLambda@Edgeを利用するため、初回のみus-east-1をbootstrapします。

```bash
npx cdk bootstrap aws://<accountId>/us-east-1
scripts/deploy.sh prod all
```

有効化すると次の設定が自動的に反映されます。

- チケット署名鍵をSecrets Managerに生成
- WebSocket `$connect` とスタンプAPIへauthorizerを追加
- `/comet-config.json` の `authEnabled` を有効化
- WebのCloudFront DistributionへLambda@Edge認証を関連付け

## Chrome拡張

Chrome拡張は認証付き環境を検出するとログイン操作を表示します。認証済みWebページから短命チケットを受け取り、期限前にWebセッションを使って更新します。

詳細は[Chrome拡張ガイド](chrome-extension.md)を参照してください。

## 無効化

設定ファイルから `auth` を削除し、同じ環境を再デプロイします。

```bash
scripts/deploy.sh <env> all
```

まずdev環境でログイン、WebSocket接続、スタンプAPI、Chrome拡張まで確認してから本番へ反映してください。
