#!/usr/bin/env bash
set -euo pipefail

PORT="8001"
HOST="127.0.0.1"

# Procesar argumentos (soporta opciones y argumentos posicionales)
pos_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)
      echo "Uso: $0 [puerto] [interfaz]"
      echo "     $0 [interfaz:puerto]"
      echo "     $0 [-p puerto] [-b interfaz]"
      echo ""
      echo "Ejemplos:"
      echo "  $0                  # http://127.0.0.1:8001"
      echo "  $0 8060             # http://127.0.0.1:8060"
      echo "  $0 8060 0.0.0.0     # http://0.0.0.0:8060 (todas las interfaces)"
      echo "  $0 0.0.0.0 8060     # http://0.0.0.0:8060"
      echo "  $0 0.0.0.0:8060     # http://0.0.0.0:8060"
      exit 0
      ;;
    -p|--port)
      if [[ $# -lt 2 ]]; then
        echo "❌ Error: Falta el valor para $1" >&2
        exit 1
      fi
      PORT="$2"
      shift 2
      ;;
    -b|--bind|--host)
      if [[ $# -lt 2 ]]; then
        echo "❌ Error: Falta el valor para $1" >&2
        exit 1
      fi
      HOST="$2"
      shift 2
      ;;
    *)
      pos_args+=("$1")
      shift
      ;;
  esac
done

if [[ ${#pos_args[@]} -eq 1 ]]; then
  arg="${pos_args[0]}"
  if [[ "$arg" =~ ^[0-9]+$ ]]; then
    PORT="$arg"
  elif [[ "$arg" == *:* ]]; then
    HOST="${arg%:*}"
    PORT="${arg##*:}"
  else
    HOST="$arg"
  fi
elif [[ ${#pos_args[@]} -ge 2 ]]; then
  arg1="${pos_args[0]}"
  arg2="${pos_args[1]}"
  if [[ "$arg1" =~ ^[0-9]+$ ]] && [[ ! "$arg2" =~ ^[0-9]+$ ]]; then
    PORT="$arg1"
    HOST="$arg2"
  elif [[ ! "$arg1" =~ ^[0-9]+$ ]] && [[ "$arg2" =~ ^[0-9]+$ ]]; then
    HOST="$arg1"
    PORT="$arg2"
  else
    PORT="$arg1"
    HOST="$arg2"
  fi
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PY_CMD=""
if command -v python3 >/dev/null 2>&1; then
  PY_CMD="python3"
elif command -v python >/dev/null 2>&1; then
  PY_CMD="python"
else
  echo "❌ Error: No se encontró Python en el sistema." >&2
  exit 1
fi

if [[ "${HOST}" == "0.0.0.0" ]]; then
  echo "🚀 Servidor iniciado en todas las interfaces (0.0.0.0) en el puerto ${PORT}"
  echo "   Acceso local: http://localhost:${PORT}"
else
  echo "🚀 Servidor local iniciado en: http://${HOST}:${PORT}"
fi

exec "${PY_CMD}" "${DIR}/scripts/servidor.py" "${PORT}" "${HOST}" "${DIR}"
