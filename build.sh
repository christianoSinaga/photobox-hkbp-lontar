#!/usr/bin/env bash
# Build photobox: aplikasi Vue -> server/wwwroot, lalu publish server ke folder publish/.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "== Build aplikasi web =="
cd "$ROOT/web"
[ -d node_modules ] || npm install
npm run build

echo "== Publish server =="
cd "$ROOT/server"
dotnet publish -c Release -o ../publish

echo "Build selesai. Jalankan ./start.sh untuk menyalakan photobox."
