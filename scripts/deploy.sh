#!/usr/bin/env bash
#
# Cometのビルド〜デプロイを1コマンドで行うスクリプト
#
# 使い方:
#   AWS_PROFILE=<profile> scripts/deploy.sh [env] [target]
#
#   env:    dev (デフォルト) | prod
#   target: all (デフォルト: インフラ+Lambda+web) | web (webのみ)
#
# 例:
#   AWS_PROFILE=myprofile scripts/deploy.sh              # devに全デプロイ
#   AWS_PROFILE=myprofile scripts/deploy.sh dev web      # devにwebのみ
#   AWS_PROFILE=myprofile scripts/deploy.sh prod         # prodに全デプロイ

set -euo pipefail
cd "$(dirname "$0")/.."

ENV_NAME="${1:-dev}"
TARGET="${2:-all}"

# AWSプロファイルの解決:
# 1. packages/cdk/comet.config.json の envs.<env>.profile（誤アカウントへのデプロイ防止のため最優先）
# 2. 環境変数 AWS_PROFILE
CONFIG_PROFILE="$(node -e "
  try {
    const c = require('./packages/cdk/comet.config.json');
    process.stdout.write(c.envs?.['${ENV_NAME}']?.profile ?? '');
  } catch { /* ファイルなしは無視 */ }
" 2>/dev/null || true)"
PROFILE="${CONFIG_PROFILE:-${AWS_PROFILE:-}}"

if [[ -z "$PROFILE" ]]; then
  echo "error: AWSプロファイルが未指定です。comet.config.json の profile か AWS_PROFILE 環境変数で指定してください" >&2
  exit 1
fi

if [[ "$ENV_NAME" != "dev" && "$ENV_NAME" != "prod" ]]; then
  echo "error: env は dev か prod を指定してください（指定値: ${ENV_NAME}）" >&2
  exit 1
fi
if [[ "$TARGET" != "all" && "$TARGET" != "web" ]]; then
  echo "error: target は all か web を指定してください（指定値: ${TARGET}）" >&2
  exit 1
fi

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

echo "==> デプロイ (env: ${ENV_NAME}, profile: ${PROFILE})"
cd packages/cdk
if [[ "$TARGET" == "web" ]]; then
  npx cdk deploy "${STACK_PREFIX}WebStack" \
    --context "env=$ENV_NAME" --profile "$PROFILE" --require-approval never
else
  npx cdk deploy --all \
    --context "env=$ENV_NAME" --profile "$PROFILE" --require-approval never
fi

echo "==> 完了"
