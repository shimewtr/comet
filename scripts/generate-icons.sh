#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly REPOSITORY_ROOT
readonly APP_ICON="${REPOSITORY_ROOT}/packages/macos-app/Resources/AppIcon.png"
readonly SWIFT_RESOURCES="${REPOSITORY_ROOT}/packages/macos-app/Sources/CometOverlay/Resources"
readonly TOOLBAR_ICON="${SWIFT_RESOURCES}/ToolbarIcon.png"
readonly WEB_PUBLIC="${REPOSITORY_ROOT}/packages/web/public"
readonly WEB_ASSETS="${REPOSITORY_ROOT}/packages/web/src/assets"
readonly CHROME_ICONS="${REPOSITORY_ROOT}/packages/chrome-extension/icons"

for source_icon in "${APP_ICON}" "${TOOLBAR_ICON}"; do
  if [[ ! -f "${source_icon}" ]]; then
    echo "Icon source not found: ${source_icon}" >&2
    exit 1
  fi
done

mkdir -p "${SWIFT_RESOURCES}" "${WEB_PUBLIC}" "${WEB_ASSETS}" "${CHROME_ICONS}"

resize_icon() {
  local size="$1"
  local destination="$2"
  local source="${3:-${APP_ICON}}"
  sips --resampleHeightWidth "${size}" "${size}" "${source}" \
    --out "${destination}" >/dev/null
}

resize_icon 512 "${WEB_PUBLIC}/comet-icon.png"
resize_icon 128 "${WEB_ASSETS}/comet-icon.png"
resize_icon 16 "${WEB_PUBLIC}/favicon-16.png"
resize_icon 32 "${WEB_PUBLIC}/favicon-32.png"
resize_icon 180 "${WEB_PUBLIC}/apple-touch-icon.png"

resize_icon 16 "${CHROME_ICONS}/icon-16.png"
resize_icon 48 "${CHROME_ICONS}/icon-48.png"
resize_icon 128 "${CHROME_ICONS}/icon-128.png"
resize_icon 16 "${CHROME_ICONS}/toolbar-16.png" "${TOOLBAR_ICON}"
resize_icon 32 "${CHROME_ICONS}/toolbar-32.png" "${TOOLBAR_ICON}"
resize_icon 48 "${CHROME_ICONS}/toolbar-48.png" "${TOOLBAR_ICON}"

echo "Generated Web and Chrome icons from ${APP_ICON}"
