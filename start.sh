#!/usr/bin/env bash
# Menyalakan photobox: server hasil publish + Chrome mode kiosk ke http://localhost:4000.
# Terminal ini adalah server. Jangan ditutup selama acara; Ctrl+C untuk mematikan.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PUBLISH_DIR="$ROOT/publish"
APP_URL="http://localhost:4000"
PROFILE_DIR="$HOME/.photobox-kiosk"

server_up() { curl -fs -o /dev/null --max-time 2 "$APP_URL/api/config"; }

if [ ! -f "$PUBLISH_DIR/Photobox.Server.dll" ]; then
  echo "Aplikasi belum di-build. Jalankan ./build.sh dulu."
  exit 1
fi

SERVER_PID=""
if server_up; then
  echo "Server sudah menyala, langsung membuka Chrome."
else
  echo "Menyalakan server..."
  (cd "$PUBLISH_DIR" && exec dotnet Photobox.Server.dll --StorageDir "$ROOT/server") &
  SERVER_PID=$!
  trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM
  for _ in $(seq 1 30); do
    server_up && break
    kill -0 "$SERVER_PID" 2>/dev/null || break
    sleep 1
  done
  server_up || { echo "Server gagal menyala (mungkin port 4000/3000 sedang dipakai)."; exit 1; }
fi

BROWSER=""
for candidate in \
  google-chrome google-chrome-stable chromium chromium-browser \
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  "/c/Program Files/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe" \
  "/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"; do
  if command -v "$candidate" >/dev/null 2>&1 || [ -x "$candidate" ]; then
    BROWSER="$candidate"
    break
  fi
done

if [ -n "$BROWSER" ]; then
  # --use-fake-ui-for-media-stream: izin kamera otomatis disetujui (profil khusus photobox).
  "$BROWSER" --kiosk "$APP_URL" --user-data-dir="$PROFILE_DIR" \
    --no-first-run --no-default-browser-check --disable-session-crashed-bubble \
    --disable-features=Translate --disable-pinch --overscroll-history-navigation=0 \
    --use-fake-ui-for-media-stream >/dev/null 2>&1 &
else
  echo "Chrome tidak ditemukan. Buka $APP_URL secara manual."
fi

if [ -n "$SERVER_PID" ]; then
  echo "Photobox berjalan. Jangan tutup terminal ini selama acara. Ctrl+C untuk mematikan server."
  wait "$SERVER_PID"
fi
