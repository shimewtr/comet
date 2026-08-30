# AWSへのデプロイ

## 必要な環境

- Node.js 24 LTS（正確なバージョンは`.node-version`を参照）
- pnpm 10
- `aws configure export-credentials` に対応したAWS CLI v2
- デプロイ先アカウントでbootstrap済みのAWS CDK

```bash
npx cdk bootstrap aws://<accountId>/ap-northeast-1
```

OIDC認証を有効にする場合はLambda@Edge用にus-east-1もbootstrapします。

```bash
npx cdk bootstrap aws://<accountId>/us-east-1
```

## 設定ファイル

環境固有の値は、Git管理対象外の `packages/cdk/comet.config.json` に置きます。

```bash
cp packages/cdk/comet.config.example.json packages/cdk/comet.config.json
```

```json
{
  "envs": {
    "dev": {
      "lambdaMemorySize": 256,
      "logRetentionDays": 3,
      "profile": "your-development-profile"
    }
  }
}
```

設定ファイルがない場合、認証なし・CloudFront自動ドメインのデフォルト構成になります。この場合は `AWS_PROFILE` を指定してください。

## 複数デプロイ先の切り替え

複数のAWSアカウントや構成を使う場合は、名前付き設定ファイルを作成します。

```text
packages/cdk/comet.config.personal.json
packages/cdk/comet.config.company-dev.json
```

第3引数で使用する設定を選択します。

```bash
scripts/deploy.sh dev all personal
scripts/deploy.sh dev web company-dev
```

`COMET_CONFIG=personal scripts/deploy.sh dev web` の形式でも指定できます。名前付き設定では `envs.<env>.profile` が必須です。設定ファイルがない、JSONが壊れている、profileがない場合はAWS操作前に終了します。

## AWS認証

通常のアクセスキー、IAM Identity Center（SSO）、`source_profile`からのAssumeRoleに対応します。

SSOの場合は、元となるSSOプロファイルへログインしてからデプロイ先を確認します。

```bash
aws sso login --profile <sso-source-profile>
aws sts get-caller-identity --profile <deploy-profile>
```

デプロイスクリプトはAWS CLIで解決した一時認証情報をCDKプロセスへ引き継ぎます。認証値をファイルやログへ出力することはありません。

## デプロイコマンド

```bash
scripts/deploy.sh dev all              # devの全スタック
scripts/deploy.sh dev web              # devのWebStack
scripts/deploy.sh prod all             # prodの全スタック
scripts/deploy.sh dev web personal     # 名前付き設定でWebStack
```

`web` を指定した場合も、CDKは依存スタックの状態を確認します。WebStackはS3への配置とCloudFrontキャッシュ無効化まで行います。

デプロイ前に差分だけ確認する場合はCDK diffを使用します。

```bash
cd packages/cdk
COMET_CONFIG=personal pnpm exec cdk diff --all --context env=dev --profile <profile>
```

## デプロイ後

CloudFormation Outputsで次の値を確認します。

- Web URL
- WebSocket URL
- スタンプAPI URL
- 履歴API URL
- CloudFront Distribution ID

WebStackが配信する `/comet-config.json` にはインフラから取得した接続先が自動設定されます。Chrome拡張はWeb URLからこの設定を自動取得できます。

## 注意点

- ConnectionsTableの置換を伴う変更は、クロススタック参照により単独更新できない場合があります。
- WebSocket APIを再作成してURLが変わっても、デプロイ済みWebとChrome拡張は `/comet-config.json` から追従します。
- 認証・独自ドメイン・IdP固有値を含む設定ファイルはコミットしないでください。
