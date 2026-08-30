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

## macOSアプリ

macOSアプリは認証付き環境へ接続すると、macOSのデフォルトブラウザでWebアプリの`/auth/desktop`を開きます。ブラウザ側のOIDCセッションでログイン後、固定URL Schemeでアプリへ戻り、次のPKCEフローで短命Cometチケットを受け取ります。

1. アプリが暗号学的乱数からstateとPKCE verifier/challengeを生成する
2. Edge認証がログイン済みセッションを確認する
3. Edge認証がsubjectとchallengeを含む2分間の交換コードをAES-GCMで暗号化し、固定`comet-overlay://auth/callback`へ返す
4. アプリがcallbackのscheme、host、path、stateを検証する
5. アプリが交換コードとverifierを`POST /auth/desktop/token`へ送り、15分間のCometチケットを取得する
6. チケットだけを端末限定のKeychainへ保存し、期限1分前に同じフローで更新してWebSocketを再接続する

IdPのaccess token、ID token、client secret、WebセッションCookieはmacOSアプリへ渡しません。ログアウト時はKeychainのチケットを削除してWebSocketを切断し、Web認証セッションのComet Cookieも消去します。発行済みチケットは最長15分で自然失効します。

### desktop認証の脅威モデル

| 脅威                       | 対策                                                                | 残る制約                                                                    |
| -------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| callbackの偽造             | 256-bit stateを照合し、scheme・host・pathを完全一致で検証           | なし                                                                        |
| カスタムURL schemeの横取り | callbackの交換コードをPKCE verifierへ束縛する                       | 悪意あるアプリはcallbackを妨害できるが、コード交換やsubjectの参照はできない |
| 任意URLへの転送            | callback URLをサーバー定数にし、クライアント指定を受け付けない      | なし                                                                        |
| 交換コードの漏えい         | subjectを含むコードをAES-256-GCMで暗号化し、有効期間を2分に制限する | verifierと同時に漏れた場合は有効期間内に交換可能                            |
| チケットの漏えい           | Keychainの`AfterFirstUnlockThisDeviceOnly`で保存し、15分で失効する  | ロック解除済み端末を完全に侵害された場合は失効まで利用され得る              |
| 交換コードの再利用         | PKCEと2分の期限で制限する                                           | Edgeはステートレスなため、verifierを持つ同一アプリから期限内の再交換は可能  |
| CSRF                       | stateとPKCEの両方を要求する                                         | なし                                                                        |

認証コードとチケットの漏えいを防ぐため、macOSアプリはdesktop認証をHTTPSのWebアプリにだけ送信します。ローカル開発用の`localhost`、`127.0.0.1`、`::1`だけはHTTPを許可します。

desktop認証ルートを有効にするCDK変更は、Web stackを次回デプロイすると反映されます。アプリだけを先に配布した場合、認証なし環境は従来どおり接続できますが、認証付き環境のdesktopログインはWeb stack更新まで利用できません。

## 無効化

設定ファイルから `auth` を削除し、同じ環境を再デプロイします。

```bash
scripts/deploy.sh <env> all
```

まずdev環境でログイン、WebSocket接続、スタンプAPI、Chrome拡張まで確認してから本番へ反映してください。
