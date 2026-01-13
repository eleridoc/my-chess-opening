#!/usr/bin/env bash
set -euo pipefail

# -----------------------------------------------------------------------------
# Icon generator for My Chess Opening
#
# Requirements (Linux):
#   sudo apt install imagemagick icnsutils
#
# Usage:
#   ./tools/generate-icons.sh ui/angular/public/app-logo.png
#
# Output (in the same folder as the input by default):
#   app-logo-16.png, app-logo-32.png, ... app-logo-1024.png
#   app-icon.ico  (multi-resolution: 16/32/48/64/128/256)
#
# Auto-copy (Electron):
#   app-icon.ico       -> electron/assets/icon.ico    (Windows)
#   app-logo-256.png   -> electron/assets/icon.png    (Linux)
#   app-icon.icns      -> electron/assets/icon.icns   (macOS)
#
# Notes:
# - Keep app-logo.png as your "master" high-res source (e.g. 1024x1024 with transparency).
# - ICO is used on Windows, PNG is used on Linux, ICNS is used on macOS.
# -----------------------------------------------------------------------------

INPUT="${1:-}"

if [[ -z "${INPUT}" ]]; then
  echo "Error: missing input PNG."
  echo "Usage: $0 <path/to/app-logo.png>"
  exit 1
fi

if [[ ! -f "${INPUT}" ]]; then
  echo "Error: file not found: ${INPUT}"
  exit 1
fi

# Prefer ImageMagick v7 "magick" if available; fallback to v6 "convert".
if command -v magick >/dev/null 2>&1; then
  IM="magick"
elif command -v convert >/dev/null 2>&1; then
  IM="convert"
else
  echo "Error: ImageMagick not found."
  echo "Install it with: sudo apt install imagemagick"
  exit 1
fi

if ! command -v identify >/dev/null 2>&1; then
  echo "Error: 'identify' not found (part of ImageMagick)."
  echo "Install it with: sudo apt install imagemagick"
  exit 1
fi

DIR="$(cd "$(dirname "${INPUT}")" && pwd)"
BASE="$(basename "${INPUT}")"
NAME="${BASE%.*}" # app-logo

# Repo root (script is in ./tools)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# Include 1024 for macOS / high-res usage
PNG_SIZES=(16 32 48 64 128 256 512 1024)

echo "Input: ${INPUT}"
echo "Output directory: ${DIR}"
echo "Repo root: ${REPO_ROOT}"
echo "Using ImageMagick: ${IM}"

# -----------------------------------------------------------------------------
# Generate PNGs
# -----------------------------------------------------------------------------
for size in "${PNG_SIZES[@]}"; do
  OUT_PNG="${DIR}/${NAME}-${size}.png"
  echo "Generating ${OUT_PNG} (${size}x${size})..."
  if [[ "${IM}" == "magick" ]]; then
	magick "${INPUT}" \
		-resize "${size}x${size}" \
		-background none \
		-gravity center \
		-extent "${size}x${size}" \
		"${OUT_PNG}"
	else
	convert "${INPUT}" \
		-resize "${size}x${size}" \
		-background none \
		-gravity center \
		-extent "${size}x${size}" \
		"${OUT_PNG}"
	fi
done

# -----------------------------------------------------------------------------
# Generate ICO (Windows / Electron)
# -----------------------------------------------------------------------------
ICO_OUT="${DIR}/app-icon.ico"
echo "Generating ${ICO_OUT} (16/32/48/64/128/256)..."

ICO_INPUTS=(
  "${DIR}/${NAME}-16.png"
  "${DIR}/${NAME}-32.png"
  "${DIR}/${NAME}-48.png"
  "${DIR}/${NAME}-64.png"
  "${DIR}/${NAME}-128.png"
  "${DIR}/${NAME}-256.png"
)

if [[ "${IM}" == "magick" ]]; then
  magick "${ICO_INPUTS[@]}" "${ICO_OUT}"
else
  convert "${ICO_INPUTS[@]}" "${ICO_OUT}"
fi

# -----------------------------------------------------------------------------
# Generate ICNS (macOS / Electron) - optional on Linux
# -----------------------------------------------------------------------------
ICNS_OUT="${DIR}/app-icon.icns"
if command -v png2icns >/dev/null 2>&1; then
  echo "Generating ${ICNS_OUT} (macOS ICNS)..."
  png2icns "${ICNS_OUT}" \
    "${DIR}/${NAME}-16.png" \
    "${DIR}/${NAME}-32.png" \
    "${DIR}/${NAME}-64.png" \
    "${DIR}/${NAME}-128.png" \
    "${DIR}/${NAME}-256.png" \
    "${DIR}/${NAME}-512.png" \
    "${DIR}/${NAME}-1024.png"
else
  echo "Warning: png2icns not found. Install with: sudo apt install icnsutils"
  echo "         Skipping macOS ICNS generation."
fi

# -----------------------------------------------------------------------------
# Auto-copy icons into Electron assets
# -----------------------------------------------------------------------------
ELECTRON_ASSETS_DIR="${REPO_ROOT}/electron/assets"
ELECTRON_ICO_OUT="${ELECTRON_ASSETS_DIR}/icon.ico"
ELECTRON_PNG_OUT="${ELECTRON_ASSETS_DIR}/icon.png"
ELECTRON_ICNS_OUT="${ELECTRON_ASSETS_DIR}/icon.icns"

echo "Installing Electron icons..."
mkdir -p "${ELECTRON_ASSETS_DIR}"

# Windows
cp -f "${ICO_OUT}" "${ELECTRON_ICO_OUT}"
echo "  ✔ ${ELECTRON_ICO_OUT}"

# Linux
cp -f "${DIR}/${NAME}-256.png" "${ELECTRON_PNG_OUT}"
echo "  ✔ ${ELECTRON_PNG_OUT}"

# macOS (only if generated)
if [[ -f "${ICNS_OUT}" ]]; then
  cp -f "${ICNS_OUT}" "${ELECTRON_ICNS_OUT}"
  echo "  ✔ ${ELECTRON_ICNS_OUT}"
fi

# -----------------------------------------------------------------------------
# Verification
# -----------------------------------------------------------------------------
echo
echo "ICO contents:"
identify "${ICO_OUT}"

echo
echo "Done."
