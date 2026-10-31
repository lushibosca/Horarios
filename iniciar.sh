#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-8001}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "🚀 Servidor local iniciado en: http://127.0.0.1:${PORT}"
exec python3 -m http.server "${PORT}" -b 127.0.0.1 -d "${DIR}"
