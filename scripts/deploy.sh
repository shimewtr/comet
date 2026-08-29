#!/usr/bin/env bash
#
# Cometのビルド〜デプロイを1コマンドで行うスクリプト
#
# 使い方:
#   AWS_PROFILE=<profile> scripts/deploy.sh [env] [target] [config]
#
#   env:    dev (デフォルト) | prod
#   target: all (デフォルト: インフラ+Lambda+web) | web (webのみ)
#   config: packages/cdk/comet.config.<config>.json の名前部分（任意）
#
# 例:
#   AWS_PROFILE=myprofile scripts/deploy.sh              # devに全デプロイ
#   AWS_PROFILE=myprofile scripts/deploy.sh dev web      # devにwebのみ
#   AWS_PROFILE=myprofile scripts/deploy.sh prod         # prodに全デプロイ
#   scripts/deploy.sh dev web personal                   # comet.config.personal.jsonを使用

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME="${1:-dev}"
TARGET="${2:-all}"
CONFIG_NAME="${3:-${COMET_CONFIG:-}}"

if [[ "$ENV_NAME" != "dev" && "$ENV_NAME" != "prod" ]]; then
  echo "error: env は dev か prod を指定してください（指定値: ${ENV_NAME}）" >&2
  exit 1
fi
if [[ "$TARGET" != "all" && "$TARGET" != "web" ]]; then
  echo "error: target は all か web を指定してください（指定値: ${TARGET}）" >&2
  exit 1
fi
if [[ -n "$CONFIG_NAME" && ! "$CONFIG_NAME" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "error: config名には英数字・ピリオド・アンダースコア・ハイフンだけを使用してください（指定値: ${CONFIG_NAME}）" >&2
  exit 1
fi

if [[ -n "$CONFIG_NAME" ]]; then
  CONFIG_FILE="packages/cdk/comet.config.${CONFIG_NAME}.json"
  CONFIG_REQUIRED="required"
  export COMET_CONFIG="$CONFIG_NAME"
else
  CONFIG_FILE="packages/cdk/comet.config.json"
  CONFIG_REQUIRED="optional"
fi

# AWSプロファイルの解決:
# 1. 選択されたcomet.config*.jsonの envs.<env>.profile（誤アカウントへのデプロイ防止のため最優先）
# 2. 環境変数 AWS_PROFILE
CONFIG_PROFILE="$(node scripts/resolve-deploy-config.mjs "$CONFIG_FILE" "$ENV_NAME" "$CONFIG_REQUIRED")"
PROFILE="${CONFIG_PROFILE:-${AWS_PROFILE:-}}"

if [[ -z "$PROFILE" ]]; then
  echo "error: AWSプロファイルが未指定です。選択した設定ファイルの profile か AWS_PROFILE 環境変数で指定してください" >&2
  exit 1
fi

# AWS CLIで選択したプロファイルを解決する。
# 親シェルに別のAWS_PROFILEが設定されていても、選択した設定を優先する。
export AWS_PROFILE="$PROFILE"

# AWS CLIで解決済みの一時認証情報を子プロセスへ渡す。
# source_profile + SSOの構成をCDKのSDKが再解決できない場合にも対応する。
# 認証値はプロセス環境内だけに保持し、ファイルやログには出力しない。
if ! CREDENTIAL_EXPORTS="$(aws configure export-credentials --profile "$PROFILE" --format env)"; then
  echo "error: aws configure export-credentials に対応したAWS CLI v2が必要です" >&2
  exit 1
fi
eval "$CREDENTIAL_EXPORTS"
unset CREDENTIAL_EXPORTS
unset AWS_PROFILE
CDK_DEFAULT_ACCOUNT="$(aws sts get-caller-identity --query Account --output text)"
export CDK_DEFAULT_ACCOUNT
PROFILE_REGION="$(aws configure get region --profile "$PROFILE" 2>/dev/null || true)"
export CDK_DEFAULT_REGION="${AWS_REGION:-${PROFILE_REGION:-ap-northeast-1}}"

# 環境によってはcorepackがpnpmを別のパッケージマネージャに解決してしまうため無効化
export COREPACK_ENABLE_STRICT=0

echo "==> ビルド (target: ${TARGET})"
pnpm --filter @comet/shared build

if [[ "$TARGET" == "all" ]]; then
  pnpm --filter @comet/websocket-handler build
  pnpm --filter @comet/stamp-upload build
fi

pnpm --filter @comet/web build

# スタック名: Comet{Dev|Prod}...
STACK_PREFIX="Comet$(tr '[:lower:]' '[:upper:]' <<<"${ENV_NAME:0:1}")${ENV_NAME:1}"

echo "==> デプロイ (env: ${ENV_NAME}, profile: ${PROFILE}, config: ${CONFIG_FILE})"
cd packages/cdk
if [[ "$TARGET" == "web" ]]; then
  npx cdk deploy "${STACK_PREFIX}WebStack" \
    --context "env=$ENV_NAME" --require-approval never
else
  npx cdk deploy --all \
    --context "env=$ENV_NAME" --require-approval never
fi

echo "==> 完了"
