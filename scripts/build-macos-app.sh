#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SCRIPT_DIR
REPOSITORY_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
readonly REPOSITORY_ROOT
readonly PACKAGE_DIR="${REPOSITORY_ROOT}/packages/macos-app"
readonly INFO_PLIST="${PACKAGE_DIR}/Resources/Info.plist"
readonly ICON_SOURCE="${REPOSITORY_ROOT}/packages/web/public/comet-icon.png"
readonly OUTPUT_ROOT="${1:-${REPOSITORY_ROOT}/build/macos}"
readonly APP_BUNDLE="${OUTPUT_ROOT}/CometOverlay.app"
readonly CONTENTS_DIR="${APP_BUNDLE}/Contents"
readonly MACOS_DIR="${CONTENTS_DIR}/MacOS"
readonly RESOURCES_DIR="${CONTENTS_DIR}/Resources"
readonly ARM64_TRIPLE="arm64-apple-macosx14.0"
readonly X86_64_TRIPLE="x86_64-apple-macosx14.0"

if [[ "${OUTPUT_ROOT}" == "/" || -z "${OUTPUT_ROOT}" ]]; then
  echo "Refusing to use an unsafe output directory" >&2
  exit 1
fi

for required_file in "${INFO_PLIST}" "${ICON_SOURCE}"; do
  if [[ ! -f "${required_file}" ]]; then
    echo "Required file not found: ${required_file}" >&2
    exit 1
  fi
done

for target_triple in "${ARM64_TRIPLE}" "${X86_64_TRIPLE}"; do
  swift build --package-path "${PACKAGE_DIR}" --configuration release \
    --product CometOverlay --triple "${target_triple}"
done
ARM64_BINARY_DIRECTORY="$(swift build --package-path "${PACKAGE_DIR}" --configuration release --triple "${ARM64_TRIPLE}" --show-bin-path)"
readonly ARM64_BINARY_DIRECTORY
X86_64_BINARY_DIRECTORY="$(swift build --package-path "${PACKAGE_DIR}" --configuration release --triple "${X86_64_TRIPLE}" --show-bin-path)"
readonly X86_64_BINARY_DIRECTORY
readonly ARM64_EXECUTABLE="${ARM64_BINARY_DIRECTORY}/CometOverlay"
readonly X86_64_EXECUTABLE="${X86_64_BINARY_DIRECTORY}/CometOverlay"

for executable in "${ARM64_EXECUTABLE}" "${X86_64_EXECUTABLE}"; do
  if [[ ! -x "${executable}" ]]; then
    echo "Release executable not found: ${executable}" >&2
    exit 1
  fi
done

if [[ -e "${APP_BUNDLE}" ]]; then
  rm -rf -- "${APP_BUNDLE}"
fi
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"
lipo -create "${ARM64_EXECUTABLE}" "${X86_64_EXECUTABLE}" \
  -output "${MACOS_DIR}/CometOverlay"
chmod 0755 "${MACOS_DIR}/CometOverlay"
install -m 0644 "${INFO_PLIST}" "${CONTENTS_DIR}/Info.plist"

ICON_TEMP_DIR="$(mktemp -d)"
readonly ICON_TEMP_DIR
readonly ICONSET_DIR="${ICON_TEMP_DIR}/CometOverlay.iconset"

cleanup() {
  rm -rf -- "${ICON_TEMP_DIR}"
}
trap cleanup EXIT
mkdir -p "${ICONSET_DIR}"

create_icon() {
  local size="$1"
  local output_name="$2"
  sips --resampleHeightWidth "${size}" "${size}" "${ICON_SOURCE}" \
    --out "${ICONSET_DIR}/${output_name}" >/dev/null
}

create_icon 16 icon_16x16.png
create_icon 32 icon_16x16@2x.png
create_icon 32 icon_32x32.png
create_icon 64 icon_32x32@2x.png
create_icon 128 icon_128x128.png
create_icon 256 icon_128x128@2x.png
create_icon 256 icon_256x256.png
create_icon 512 icon_256x256@2x.png
create_icon 512 icon_512x512.png
create_icon 1024 icon_512x512@2x.png
iconutil --convert icns --output "${RESOURCES_DIR}/CometOverlay.icns" "${ICONSET_DIR}"

plutil -lint "${CONTENTS_DIR}/Info.plist" >/dev/null
lipo "${MACOS_DIR}/CometOverlay" -verify_arch arm64 x86_64
if [[ "$(/usr/libexec/PlistBuddy -c 'Print :CFBundleURLTypes:0:CFBundleURLSchemes:0' "${CONTENTS_DIR}/Info.plist")" != "comet-overlay" ]]; then
  echo "Desktop authentication URL scheme is missing from the app bundle" >&2
  exit 1
fi

echo "Created unsigned app bundle: ${APP_BUNDLE}"
